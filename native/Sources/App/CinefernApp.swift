import SwiftUI

@main struct CinefernApp: App {
  @StateObject private var model = AppModel()
  var body: some Scene {
    WindowGroup {
      RootView().environmentObject(model)
        .tint(Color(red: 0.91, green: 0.68, blue: 0.36))
        .preferredColorScheme(.dark)
        .task { await model.boot() }
        .alert(
          model.text("Cinefern", "Cinefern"),
          isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })
        ) {
          Button("OK") { model.error = nil }
        } message: {
          Text(model.error ?? "")
        }
        .modifier(PlaybackPresentation(model: model))
    }
    #if os(macOS)
      .defaultSize(width: 1180, height: 780)
    #endif
  }
}

enum Destination: String, CaseIterable, Identifiable {
  case home, search, watchlist, history, downloads, providers, settings
  var id: String { rawValue }
  var symbol: String {
    switch self {
    case .home: return "play.rectangle"
    case .search: return "magnifyingglass"
    case .watchlist: return "bookmark"
    case .history: return "clock"
    case .downloads: return "arrow.down.circle"
    case .providers: return "square.stack.3d.up"
    case .settings: return "gearshape"
    }
  }
  func title(_ german: Bool) -> String {
    switch self {
    case .home: return german ? "Jetzt ansehen" : "Watch now"
    case .search: return german ? "Suchen" : "Search"
    case .watchlist: return german ? "Merkliste" : "Watchlist"
    case .history: return german ? "Verlauf" : "History"
    case .downloads: return "Downloads"
    case .providers: return german ? "Anbieter" : "Providers"
    case .settings: return german ? "Einstellungen" : "Settings"
    }
  }
}
struct RootView: View {
  @EnvironmentObject var model: AppModel
  @State private var destination: Destination? = .home
  var body: some View {
    Group {
      if !model.ready {
        ProgressView("Cinefern")
      } else if !model.state["setupComplete"].bool {
        welcome
      } else {
        #if os(tvOS)
          TabView {
            ForEach(Destination.allCases) { item in
              NavigationStack { content(item) }.tabItem {
                Label(item.title(model.german), systemImage: item.symbol)
              }
            }
          }
        #elseif os(iOS)
          if #available(iOS 18, *) {
            tabs.tabViewStyle(.sidebarAdaptable)
          } else {
            tabs
          }
        #else
          NavigationSplitView {
            List(Destination.allCases, selection: $destination) { item in
              Label(item.title(model.german), systemImage: item.symbol).tag(item)
            }
            .navigationTitle("Cinefern")
          } detail: {
            NavigationStack { content(destination ?? .home) }
          }
        #endif
      }
    }
  }
  var tabs: some View {
    TabView(selection: $destination) {
      ForEach(Destination.allCases) { item in
        NavigationStack { content(item) }
          .tabItem { Label(item.title(model.german), systemImage: item.symbol) }
          .tag(Optional(item))
      }
    }
  }
  var welcome: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 28) {
        Image(systemName: "play.rectangle.fill").font(.system(size: 74)).foregroundStyle(.tint)
        Text(model.text("Your cinema. Every screen.", "Dein Kino. Auf jedem Bildschirm.")).font(
          .largeTitle.bold())
        Text(
          model.text(
            "Connect your Jellyfin server, add your catalog, or install a provider you trust.",
            "Verbinde deinen Jellyfin-Server, füge deinen Katalog hinzu oder installiere einen Anbieter, dem du vertraust."
          )
        ).font(.title3).foregroundStyle(.secondary)
        Picker(
          "Language / Sprache",
          selection: Binding(
            get: { model.settings["language"].string },
            set: { value in
              Task { await model.action("settings", .object(["language": .string(value)])) }
            })
        ) {
          Text("English").tag("en")
          Text("Deutsch").tag("de")
        }
        Button(model.text("Get started", "Los geht’s")) { Task { await model.action("setup") } }
          .buttonStyle(.borderedProminent)
      }.padding(40).frame(maxWidth: 680, alignment: .leading)
    }
  }
  @ViewBuilder func content(_ destination: Destination) -> some View {
    switch destination {
    case .home: HomeScreen()
    case .search: SearchScreen()
    case .watchlist: LibraryScreen(kind: .watchlist)
    case .history: LibraryScreen(kind: .history)
    case .downloads: DownloadsScreen()
    case .providers: ProvidersScreen()
    case .settings: SettingsScreen()
    }
  }
}
struct Artwork: View {
  let item: JSONValue
  var wide = false
  var body: some View {
    AsyncImage(url: URL(string: item[wide ? "backdrop" : "poster"].string)) { image in
      image.resizable().scaledToFill()
    } placeholder: {
      Rectangle().fill(Color(red: 0.09, green: 0.12, blue: 0.18)).overlay {
        Image(systemName: item["type"].string == "series" ? "tv" : "film").font(.largeTitle)
          .foregroundStyle(.secondary)
      }
    }.aspectRatio(wide ? 16 / 9 : 2 / 3, contentMode: .fit).clipped().clipShape(
      RoundedRectangle(cornerRadius: 12)
    )
    .accessibilityHidden(true)
  }
}
struct MediaCard: View {
  let item: JSONValue
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Artwork(item: item)
      Text(item["title"].string).font(.headline).lineLimit(2)
      if item["year"] != .null {
        Text(String(Int(item["year"].double))).font(.caption).foregroundStyle(.secondary)
      }
    }.frame(width: 156, alignment: .topLeading)
  }
}
struct MediaShelf: View {
  let title: String
  let items: [JSONValue]
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text(title).font(.title2.bold()).padding(.horizontal, 24)
      ScrollView(.horizontal) {
        LazyHStack(alignment: .top, spacing: 20) {
          ForEach(Array(items.enumerated()), id: \.offset) { _, item in
            NavigationLink {
              DetailScreen(item: item)
            } label: {
              MediaCard(item: item)
            }.buttonStyle(.plain)
          }
        }.padding(.horizontal, 24).padding(.vertical, 8)
      }
    }
  }
}
struct HomeScreen: View {
  @EnvironmentObject var model: AppModel
  @State private var mediaType = ""
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 32) {
        if let featured = model.feeds.flatMap({ $0["featured"].array }).first {
          VStack(alignment: .leading, spacing: 14) {
            Artwork(item: featured, wide: true).frame(maxHeight: 380)
            Text(featured["title"].string).font(.largeTitle.bold())
            Text(featured["overview"].string).foregroundStyle(.secondary).lineLimit(3)
            NavigationLink {
              DetailScreen(item: featured)
            } label: {
              Label(model.text("Explore", "Entdecken"), systemImage: "play.fill")
            }.buttonStyle(.borderedProminent)
          }.padding(24)
        }
        if model.state["enabledProviders"].array.isEmpty {
          ContentUnavailableView(
            model.text("Your library starts here", "Hier beginnt deine Mediathek"),
            systemImage: "square.stack.3d.up",
            description: Text(
              model.text(
                "Add a provider to browse films and series.",
                "Füge einen Anbieter hinzu, um Filme und Serien zu entdecken.")))
          NavigationLink {
            ProvidersScreen()
          } label: {
            Text(model.text("Connect a provider", "Anbieter verbinden"))
          }.padding(.horizontal, 24)
        }
        if !model.snapshot["continueWatching"].array.isEmpty {
          MediaShelf(
            title: model.text("Continue watching", "Weiterschauen"),
            items: model.snapshot["continueWatching"].array.map { $0["item"] })
        }
        ForEach(Array(model.feeds.enumerated()), id: \.offset) { _, feed in
          if !feed["error"].string.isEmpty {
            Text(feed["name"].string + ": " + feed["error"].string).foregroundStyle(.secondary)
              .padding(.horizontal, 24)
          }
          ForEach(Array(feed["collections"].array.enumerated()), id: \.offset) { _, collection in
            MediaShelf(
              title: collection["title"].string,
              items: collection["items"].array.filter {
                mediaType.isEmpty || $0["type"].string == mediaType
              })
            NavigationLink(model.text("See all", "Alle ansehen")) {
              CollectionScreen(reference: collection)
            }.padding(.horizontal, 24)
          }
        }
      }.padding(.bottom, 32)
    }.navigationTitle(model.text("Watch now", "Jetzt ansehen"))
      .toolbar {
        ToolbarItem {
          Picker(model.text("Media", "Medien"), selection: $mediaType) {
            Text(model.text("All", "Alle")).tag("")
            Text(model.text("Films", "Filme")).tag("movie")
            Text(model.text("Series", "Serien")).tag("series")
          }
        }
      }
      .refreshable { await model.reloadHome() }
  }
}
struct SearchScreen: View {
  @EnvironmentObject var model: AppModel
  @State private var query = ""
  @State private var pages: [JSONValue] = []
  @State private var provider = ""
  @State private var type = ""
  @State private var loading = false
  @State private var revision = UUID()
  var body: some View {
    List {
      Picker(model.text("Provider", "Anbieter"), selection: $provider) {
        Text(model.text("All", "Alle")).tag("")
        ForEach(model.snapshot["providers"].array, id: \.mediaKey) { p in
          Text(p["name"].string).tag(p["id"].string)
        }
      }
      Picker(model.text("Type", "Typ"), selection: $type) {
        Text(model.text("All", "Alle")).tag("")
        Text(model.text("Films", "Filme")).tag("movie")
        Text(model.text("Series", "Serien")).tag("series")
      }
      if loading { ProgressView() }
      ForEach(Array(pages.enumerated()), id: \.offset) { _, page in
        Section(page["providerId"].string) {
          if page["error"] != .null { Text(page["error"].string).foregroundStyle(.secondary) }
          ForEach(Array(page["items"].array.enumerated()), id: \.offset) { _, item in
            NavigationLink(item["title"].string) { DetailScreen(item: item) }
          }
          if page["nextCursor"] != .null {
            Button(model.text("Load more", "Mehr laden")) {
              Task { await search(more: page["providerId"].string) }
            }
          }
        }
      }
    }.navigationTitle(model.text("Search", "Suchen")).searchable(text: $query)
      .task(id: query + provider + type) {
        try? await Task.sleep(for: .milliseconds(350))
        guard !Task.isCancelled else { return }
        await search()
      }
  }
  func search(more: String? = nil) async {
    guard !query.trimmingCharacters(in: .whitespaces).isEmpty else {
      pages = []
      return
    }
    let token = UUID()
    revision = token
    loading = true
    do {
      var cursors: [String: JSONValue] = [:]
      if let more, let page = pages.first(where: { $0["providerId"].string == more }) {
        cursors[more] = page["nextCursor"]
      }
      let result = try await model.call(
        "search",
        .object([
          "query": .string(query), "providerId": .string(more ?? provider),
          "type": type.isEmpty ? .null : .string(type), "cursors": .object(cursors),
        ]))
      guard revision == token, !Task.isCancelled else { return }
      if more != nil {
        for page in result.array {
          if let index = pages.firstIndex(where: { $0["providerId"] == page["providerId"] }) {
            var updated = page
            updated["items"] = .array(pages[index]["items"].array + page["items"].array)
            pages[index] = updated
          }
        }
      } else {
        pages = result.array
      }
    } catch { if revision == token { model.error = error.localizedDescription } }
    if revision == token { loading = false }
  }
}

struct PlaybackPresentation: ViewModifier {
  @ObservedObject var model: AppModel
  @ViewBuilder func body(content: Content) -> some View {
    #if os(macOS)
      content.sheet(item: $model.playback) { session in
        PlayerScreen(session: session).environmentObject(model)
      }
    #else
      content.fullScreenCover(item: $model.playback) { session in
        PlayerScreen(session: session).environmentObject(model)
      }
    #endif
  }
}
