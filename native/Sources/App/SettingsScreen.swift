import SwiftUI
import UniformTypeIdentifiers

#if !os(tvOS)
  struct LibraryDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var text: String
    init(_ text: String = "") { self.text = text }
    init(configuration: ReadConfiguration) throws {
      text = String(decoding: configuration.file.regularFileContents ?? Data(), as: UTF8.self)
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
      FileWrapper(regularFileWithContents: Data(text.utf8))
    }
  }
#endif
struct SettingsScreen: View {
  @EnvironmentObject var model: AppModel
  @AppStorage("cinefern.native.player") private var engine = "avkit"
  #if !os(tvOS)
    @State private var exportDocument = LibraryDocument()
  #endif
  @State private var exporting = false
  @State private var importing = false
  @State private var importURL = ""
  @State private var reset = false
  var body: some View {
    Form {
      Section(model.text("Playback", "Wiedergabe")) {
        Picker(model.text("Player", "Player"), selection: $engine) {
          Text("Apple AVKit").tag("avkit")
          if PlayerEngine.vlcAvailable { Text("VLC / VLCKit").tag("vlc") }
        }
        if !PlayerEngine.vlcAvailable {
          Text(
            model.text(
              "VLC is optional and requires a build with VLCKit.",
              "VLC ist optional und benötigt einen Build mit VLCKit.")
          ).font(.caption).foregroundStyle(.secondary)
        }
        Picker(model.text("Quality", "Qualität"), selection: number("quality")) {
          ForEach([480, 720, 1080, 2160], id: \.self) { Text("\($0)p").tag(Double($0)) }
        }
        TextField(model.text("Audio language", "Audiosprache"), text: string("audioLanguage"))
        TextField(
          model.text("Subtitle language", "Untertitelsprache"), text: string("subtitleLanguage"))
        Toggle(
          model.text("Autoplay next episode", "Nächste Folge automatisch abspielen"),
          isOn: bool("autoplay"))
        Toggle(model.text("Resume playback", "Wiedergabe fortsetzen"), isOn: bool("resume"))
      }
      Section(model.text("Library", "Mediathek")) {
        Picker("Language / Sprache", selection: string("language")) {
          Text("English").tag("en")
          Text("Deutsch").tag("de")
        }
        Toggle(
          model.text("Show adult content", "Erwachseneninhalte anzeigen"), isOn: bool("showAdult"))
        NavigationLink(model.text("Media agent", "Medien-Agent")) { AgentSettingsScreen() }
        NavigationLink(model.text("Resolver priority", "Resolver-Reihenfolge")) {
          ResolverSettingsScreen()
        }
        #if !os(tvOS)
          Button(model.text("Export watchlist & history", "Merkliste & Verlauf exportieren")) {
            Task {
              do {
                exportDocument = LibraryDocument(try await model.call("export").string)
                exporting = true
              } catch { model.error = error.localizedDescription }
            }
          }
          Button(model.text("Import library backup", "Mediathek-Backup importieren")) {
            importing = true
          }
        #endif
        TextField(model.text("Backup URL", "Backup-URL"), text: $importURL).autocorrectionDisabled()
        Button(model.text("Import backup from URL", "Backup von URL importieren")) {
          Task {
            do {
              let text = try await model.call("document", .object(["url": .string(importURL)]))
                .string
              await model.action("import", .object(["text": .string(text)]))
            } catch { model.error = error.localizedDescription }
          }
        }
      }
      Section(model.text("Maintenance", "Verwaltung")) {
        Button(model.text("Clear provider cache", "Anbieter-Cache leeren")) {
          Task { await model.action("clearCache") }
        }
        Button(model.text("Clear watch history", "Verlauf löschen"), role: .destructive) {
          Task { await model.action("clearHistory") }
        }
        Button(model.text("Reset native app", "Native App zurücksetzen"), role: .destructive) {
          reset = true
        }
      }
    }.navigationTitle(model.text("Settings", "Einstellungen"))
      .confirmationDialog(
        model.text(
          "Reset the native library and remove downloads?",
          "Native Mediathek zurücksetzen und Downloads entfernen?"), isPresented: $reset,
        titleVisibility: .visible
      ) {
        Button(model.text("Reset", "Zurücksetzen"), role: .destructive) {
          Task { await model.action("reset", reload: true) }
        }
      }
      #if !os(tvOS)
        .fileExporter(
          isPresented: $exporting, document: exportDocument, contentType: .json,
          defaultFilename: "cinefern-library"
        ) { result in
          if case .failure(let error) = result { model.error = error.localizedDescription }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
          do {
            let file = try result.get()
            let scoped = file.startAccessingSecurityScopedResource()
            defer { if scoped { file.stopAccessingSecurityScopedResource() } }
            let text = try String(contentsOf: file, encoding: .utf8)
            Task { await model.action("import", .object(["text": .string(text)])) }
          } catch { model.error = error.localizedDescription }
        }
      #endif
  }
  func bool(_ key: String) -> Binding<Bool> {
    Binding(
      get: { model.settings[key].bool },
      set: { value in Task { await model.action("settings", .object([key: .bool(value)])) } })
  }
  func string(_ key: String) -> Binding<String> {
    Binding(
      get: { model.settings[key].string },
      set: { value in Task { await model.action("settings", .object([key: .string(value)])) } })
  }
  func number(_ key: String) -> Binding<Double> {
    Binding(
      get: { model.settings[key].double },
      set: { value in Task { await model.action("settings", .object([key: .number(value)])) } })
  }
}
struct AgentSettingsScreen: View {
  @EnvironmentObject var model: AppModel
  @State private var settings: JSONValue = .null
  @State private var key = ""
  var body: some View {
    Form {
      Section {
        Toggle(model.text("Enable media agent", "Medien-Agent aktivieren"), isOn: bool("enabled"))
        Text(
          model.text(
            "Agent requests use your service credits. Each provider needs its own grant. Only declared and enabled tools are available.",
            "Agent-Anfragen verbrauchen dein Dienstguthaben. Jeder Anbieter benötigt eine eigene Freigabe. Nur deklarierte und aktivierte Werkzeuge sind verfügbar."
          )
        ).font(.caption)
        Picker(model.text("AI service", "KI-Dienst"), selection: string("backend")) {
          Text("OpenAI").tag("openai")
          Text("xAI").tag("xai")
          Text("OpenRouter").tag("openrouter")
        }
        TextField(
          model.text("Model", "Modell"),
          text: Binding(
            get: { settings["models"][settings["backend"].string].string },
            set: { settings["models"][settings["backend"].string] = .string($0) }))
        SecureField(model.text("API key", "API-Schlüssel"), text: $key)
        Button(model.text("Save API key", "API-Schlüssel speichern")) {
          Task {
            await model.action(
              "agentKey", .object(["backend": settings["backend"], "key": .string(key)]))
            key = ""
          }
        }
        Button(model.text("Remove API key", "API-Schlüssel entfernen"), role: .destructive) {
          Task {
            await model.action(
              "agentKey", .object(["backend": settings["backend"], "key": .string("")]))
          }
        }
        Text(
          model.snapshot["agentKeys"][settings["backend"].string].bool
            ? model.text("API key stored securely", "API-Schlüssel sicher gespeichert")
            : model.text("No API key stored", "Kein API-Schlüssel gespeichert")
        ).font(.caption)
      }
      Section(model.text("Tools & limits", "Werkzeuge & Limits")) {
        Toggle(model.text("Web search", "Websuche"), isOn: bool("webSearch"))
        Toggle(model.text("Read-only web reader", "Webseiten nur lesen"), isOn: bool("browser"))
        Picker(
          model.text("Model calls per run", "Modellaufrufe je Anfrage"),
          selection: number("maxModelCalls")
        ) { ForEach(2...10, id: \.self) { Text(String($0)).tag(Double($0)) } }
        Picker(
          model.text("Tool calls per run", "Werkzeugaufrufe je Anfrage"),
          selection: number("maxToolCalls")
        ) { ForEach(1...12, id: \.self) { Text(String($0)).tag(Double($0)) } }
        TextField(
          model.text("Runs per hour", "Anfragen je Stunde"),
          text: Binding(
            get: { String(Int(settings["maxRunsPerHour"].double)) },
            set: { settings["maxRunsPerHour"] = .number(Double($0) ?? 20) }))
        Button(model.text("Save agent settings", "Agent-Einstellungen speichern")) {
          Task { await model.action("agentSettings", settings) }
        }
      }
    }.navigationTitle(model.text("Media agent", "Medien-Agent")).onAppear {
      settings = model.snapshot["agent"]
    }
  }
  func bool(_ key: String) -> Binding<Bool> {
    Binding(get: { settings[key].bool }, set: { settings[key] = .bool($0) })
  }
  func string(_ key: String) -> Binding<String> {
    Binding(get: { settings[key].string }, set: { settings[key] = .string($0) })
  }
  func number(_ key: String) -> Binding<Double> {
    Binding(get: { settings[key].double }, set: { settings[key] = .number($0) })
  }
}
struct ResolverSettingsScreen: View {
  @EnvironmentObject var model: AppModel
  var resolvers: [JSONValue] {
    let all = model.snapshot["providers"].array.filter {
      $0["capabilities"].array.contains(.string("resolve"))
    }
    let order = model.state["resolverOrder"].array
    return all.sorted {
      (order.firstIndex(of: $0["id"]) ?? Int.max) < (order.firstIndex(of: $1["id"]) ?? Int.max)
    }
  }
  var body: some View {
    List {
      ForEach(Array(resolvers.enumerated()), id: \.offset) { index, provider in
        HStack {
          Text(provider["name"].string)
          Spacer()
          Button {
            move(index, by: -1)
          } label: {
            Label(model.text("Move up", "Nach oben"), systemImage: "arrow.up")
          }.disabled(index == 0)
          Button {
            move(index, by: 1)
          } label: {
            Label(model.text("Move down", "Nach unten"), systemImage: "arrow.down")
          }.disabled(index == resolvers.count - 1)
        }
      }
      if resolvers.isEmpty {
        Text(
          model.text(
            "Install a provider with resolver support.",
            "Installiere einen Anbieter mit Resolver-Unterstützung."))
      }
    }.navigationTitle(model.text("Resolver priority", "Resolver-Reihenfolge"))
  }
  func move(_ index: Int, by offset: Int) {
    var order = resolvers.map { $0["id"] }
    guard order.indices.contains(index + offset) else { return }
    order.swapAt(index, index + offset)
    Task { await model.action("resolverOrder", .array(order)) }
  }
}
