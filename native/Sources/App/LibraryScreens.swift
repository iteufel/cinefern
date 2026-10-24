import SwiftUI

struct DetailScreen: View {
  @EnvironmentObject var model: AppModel
  let item: JSONValue
  @State private var detail: JSONValue = .null
  @State private var seasons: [JSONValue] = []
  @State private var episodes: [JSONValue] = []
  @State private var suggestions: [JSONValue] = []
  @State private var selectedSeason = ""
  var current: JSONValue { detail == .null ? item : detail }
  var capabilities: [String] {
    model.snapshot["providers"].array.first { $0["id"] == item["providerId"] }?["capabilities"]
      .array.map(\.string) ?? []
  }
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        Artwork(item: current, wide: true).frame(maxHeight: 360)
        Text(current["title"].string).font(.largeTitle.bold())
        HStack {
          if current["year"] != .null { Text(String(Int(current["year"].double))) }
          Text(current["genres"].array.map(\.string).joined(separator: " · "))
        }.font(.subheadline).foregroundStyle(.secondary)
        ViewThatFits(in: .horizontal) {
          HStack { actions }
          VStack(alignment: .leading) { actions }
        }
        Text(current["overview"].string)
        if capabilities.contains("series") && current["type"].string == "series" {
          Picker(model.text("Season", "Staffel"), selection: $selectedSeason) {
            ForEach(seasons, id: \.mediaKey) { season in
              Text(season["title"].string).tag(season["id"].string)
            }
          }
          ForEach(Array(episodes.enumerated()), id: \.offset) { _, episode in
            HStack {
              NavigationLink(episode["title"].string) { DetailScreen(item: episode) }
              Spacer()
              Button {
                Task { await model.play(episode, queue: episodes) }
              } label: {
                Label(model.text("Play", "Abspielen"), systemImage: "play.fill")
              }
            }
          }
        }
        if !current["cast"].array.isEmpty {
          Text(model.text("Cast & crew", "Besetzung & Team")).font(.title2.bold())
          ForEach(Array(current["cast"].array.enumerated()), id: \.offset) { _, person in
            NavigationLink(person["name"].string + " · " + person["role"].string) {
              PersonScreen(person: person)
            }
          }
        }
        ForEach(current["info"].object.keys.sorted(), id: \.self) { key in
          LabeledContent(key, value: current["info"][key].string)
        }
        if !suggestions.isEmpty {
          MediaShelf(
            title: model.text("You may also like", "Das könnte dir gefallen"), items: suggestions)
        }
      }.padding(24)
    }.navigationTitle(current["title"].string)
      .task(id: item.mediaKey) {
        do {
          if item["providerId"].string != "direct" {
            detail = try await model.providerCall(item, "getItem", [item["id"]])
            _ = try await model.call("opened", current)
          }
          if capabilities.contains("series") && current["type"].string == "series" {
            seasons = try await model.providerCall(current, "getSeasons", [current["id"]]).array
            selectedSeason = seasons.first?["id"].string ?? ""
          }
          suggestions =
            (try? await model.providerCall(current, "getSuggestions", [current["id"]]).array) ?? []
        } catch { model.error = error.localizedDescription }
      }.task(id: selectedSeason) {
        guard !selectedSeason.isEmpty else { return }
        do {
          episodes = try await model.providerCall(
            current, "getEpisodes", [current["id"], .string(selectedSeason)]
          ).array
        } catch { model.error = error.localizedDescription }
      }
  }
  @ViewBuilder var actions: some View {
    if current["type"].string != "series" && current["type"].string != "collection" {
      Button {
        Task { await model.play(current) }
      } label: {
        Label(model.text("Play", "Abspielen"), systemImage: "play.fill")
      }.buttonStyle(.borderedProminent).disabled(model.busy)
    }
    Button {
      Task { await model.action("save", current) }
    } label: {
      Label(
        model.text("Watchlist", "Merkliste"),
        systemImage: model.state["watchlist"].array.contains {
          $0["item"].mediaKey == current.mediaKey
        } ? "bookmark.fill" : "bookmark")
    }.buttonStyle(.bordered)
    if capabilities.contains("trailers") {
      Button(model.text("Preview", "Vorschau")) {
        Task { await model.play(current, trailer: true) }
      }.buttonStyle(.bordered)
    }
    Menu {
      Button(model.text("Download", "Herunterladen")) {
        Task { await model.action("download", .object(["item": current])) }
      }
      if current["type"].string == "series" {
        Button(model.text("Toggle episode updates", "Folgenupdates umschalten")) {
          Task { await model.action("notify", current) }
        }
      }
    } label: {
      Label(model.text("More", "Mehr"), systemImage: "ellipsis.circle")
    }
  }
}
struct CollectionScreen: View {
  @EnvironmentObject var model: AppModel
  let reference: JSONValue
  @State private var collection: JSONValue = .null
  @State private var sort = ""
  var body: some View {
    List {
      if !collection["sorting"].array.isEmpty {
        Picker(model.text("Sort", "Sortieren"), selection: $sort) {
          ForEach(collection["sorting"].array, id: \.mediaKey) { option in
            Text(option["label"].string).tag(option["id"].string)
          }
        }
      }
      ForEach(Array(collection["items"].array.enumerated()), id: \.offset) { _, item in
        NavigationLink(item["title"].string) { DetailScreen(item: item) }
      }
      if collection["nextCursor"] != .null {
        Button(model.text("Load more", "Mehr laden")) { Task { await load(more: true) } }
      }
    }.navigationTitle(reference["title"].string).task(id: sort) { await load() }
  }
  func load(more: Bool = false) async {
    do {
      let options: JSONValue = .object([
        "limit": .number(60), "sort": .string(sort),
        "cursor": more ? collection["nextCursor"] : .null,
      ])
      var result = try await model.providerCall(
        reference, "getCollection", [reference["id"], options])
      if more { result["items"] = .array(collection["items"].array + result["items"].array) }
      collection = result
    } catch { model.error = error.localizedDescription }
  }
}
struct PersonScreen: View {
  @EnvironmentObject var model: AppModel
  let person: JSONValue
  @State private var result: JSONValue = .null
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        Text(result["person"]["biography"].string)
        MediaShelf(title: model.text("Credits", "Mitgewirkt in"), items: result["credits"].array)
      }.padding(24)
    }.navigationTitle(person["name"].string).task {
      do { result = try await model.providerCall(person, "getPerson", [person["id"]]) } catch {
        model.error = error.localizedDescription
      }
    }
  }
}
struct LibraryScreen: View {
  @EnvironmentObject var model: AppModel
  let kind: Destination
  @State private var provider = ""
  @State private var type = ""
  @State private var alphabetical = false
  var entries: [JSONValue] {
    let all = model.state[kind == .watchlist ? "watchlist" : "history"].array.filter { entry in
      (provider.isEmpty || entry["item"]["providerId"].string == provider)
        && (type.isEmpty || entry["item"]["type"].string == type)
    }
    return alphabetical
      ? all.sorted {
        $0["item"]["title"].string.localizedStandardCompare($1["item"]["title"].string)
          == .orderedAscending
      } : all
  }
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
      Toggle(model.text("Sort by title", "Nach Titel sortieren"), isOn: $alphabetical)
      ForEach(Array(entries.enumerated()), id: \.offset) { _, entry in
        NavigationLink {
          DetailScreen(item: entry["item"])
        } label: {
          VStack(alignment: .leading) {
            Text(entry["item"]["title"].string)
            if kind == .history {
              ProgressView(value: entry["position"].double, total: max(1, entry["duration"].double))
            }
            if !entry["newEpisodes"].array.isEmpty {
              Text(model.text("New episodes", "Neue Folgen")).foregroundStyle(.tint)
            }
          }
        }
      }
      if entries.isEmpty {
        Text(model.text("Nothing here yet.", "Hier ist noch nichts.")).foregroundStyle(.secondary)
      }
    }.navigationTitle(kind.title(model.german)).toolbar {
      ToolbarItem {
        if kind == .watchlist {
          Button {
            Task { await model.action("checkUpdates") }
          } label: {
            Label(model.text("Check episodes", "Folgen prüfen"), systemImage: "arrow.clockwise")
          }
        }
      }
    }
  }
}
struct DownloadsScreen: View {
  @EnvironmentObject var model: AppModel
  var body: some View {
    List {
      ForEach(Array(model.state["downloads"].array.enumerated()), id: \.offset) { _, entry in
        VStack(alignment: .leading, spacing: 12) {
          Text(entry["item"]["title"].string).font(.headline)
          Text(entry["status"].string).foregroundStyle(.secondary)
          if !entry["error"].string.isEmpty { Text(entry["error"].string).font(.caption) }
          if entry["status"].string == "complete" {
            Button(model.text("Play offline", "Offline abspielen")) {
              Task { await model.play(entry["item"]) }
            }
          } else if entry["status"].string == "downloading" {
            Button(model.text("Cancel", "Abbrechen")) {
              Task { await model.action("downloadCancel", .object(["id": entry["id"]])) }
            }
          } else {
            Button(model.text("Retry", "Erneut versuchen")) {
              Task { await model.action("downloadRetry", .object(["id": entry["id"]])) }
            }
          }
          Button(model.text("Remove", "Entfernen"), role: .destructive) {
            Task { await model.action("downloadRemove", .object(["id": entry["id"]])) }
          }
        }
      }
      if model.state["downloads"].array.isEmpty {
        Text(
          model.text(
            "Download supported file sources from a title’s menu.",
            "Lade unterstützte Dateien über das Menü eines Titels herunter."))
      }
    }.navigationTitle("Downloads").task {
      while !Task.isCancelled {
        await model.action("snapshot")
        try? await Task.sleep(for: .seconds(2))
      }
    }
  }
}
