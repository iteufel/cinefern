import SwiftUI
import UniformTypeIdentifiers

struct ProvidersScreen: View {
  @EnvironmentObject var model: AppModel
  @State private var url = ""
  @State private var text = ""
  @State private var review: JSONValue = .null
  @State private var reviewing = false
  @State private var importing = false
  @State private var loading = false
  var body: some View {
    List {
      Section(model.text("Your providers", "Deine Anbieter")) {
        ForEach(model.snapshot["providers"].array, id: \.mediaKey) { manifest in
          NavigationLink {
            ProviderSettingsScreen(manifest: manifest)
          } label: {
            VStack(alignment: .leading) {
              Text(manifest["name"].string).font(.headline)
              Text(manifest["description"].string).font(.caption).foregroundStyle(.secondary)
              if model.state["enabledProviders"].array.contains(manifest["id"]) {
                Text(model.text("Enabled", "Aktiv")).font(.caption).foregroundStyle(.tint)
              }
            }
          }
        }
      }
      Section(model.text("Install a provider", "Anbieter installieren")) {
        TextField(model.text("Bundle URL (.cfprovider)", "Bundle-URL (.cfprovider)"), text: $url)
          .autocorrectionDisabled()
        Button(model.text("Review from URL", "URL prüfen")) {
          Task {
            loading = true
            defer { loading = false }
            do {
              text = try await model.call("document", .object(["url": .string(url)])).string
              await inspect()
            } catch { model.error = error.localizedDescription }
          }
        }.disabled(loading)
        #if !os(tvOS)
          Button(model.text("Choose .cfprovider file", ".cfprovider-Datei auswählen")) {
            importing = true
          }
        #endif
        Text(
          model.text(
            "Providers can access the origins and storage listed in their manifest. Review these before installing. Agent access requires a separate grant.",
            "Anbieter können auf die im Manifest genannten Server und Speicher zugreifen. Prüfe diese Angaben vor der Installation. Agent-Zugriff wird separat freigegeben."
          )
        ).font(.caption).foregroundStyle(.secondary)
      }
      Section(model.text("Open a stream", "Stream öffnen")) { DirectStreamForm() }
      ForEach(Array(model.snapshot["errors"].array.enumerated()), id: \.offset) { _, failure in
        Text(failure["id"].string + ": " + failure["error"].string).foregroundStyle(.red)
      }
    }.navigationTitle(model.text("Providers", "Anbieter"))
      #if !os(tvOS)
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json, .data]) { result in
          do {
            let file = try result.get()
            let scoped = file.startAccessingSecurityScopedResource()
            defer { if scoped { file.stopAccessingSecurityScopedResource() } }
            text = try String(contentsOf: file, encoding: .utf8)
            Task { await inspect() }
          } catch { model.error = error.localizedDescription }
        }
      #endif
      .sheet(isPresented: $reviewing) {
        NavigationStack {
          List {
            Section(review["name"].string) {
              Text(review["description"].string)
              LabeledContent("Version", value: review["version"].string)
              LabeledContent(model.text("Author", "Autor"), value: review["author"].string)
            }
            Section(model.text("Network access", "Netzwerkzugriff")) {
              ForEach(review["permissions"]["network"].array, id: \.string) { Text($0.string) }
              if review["permissions"]["network"].array.isEmpty {
                Text(model.text("None", "Keiner"))
              }
            }
            Section(model.text("Permissions", "Berechtigungen")) {
              LabeledContent(
                model.text("Private provider storage", "Privater Anbieterspeicher"),
                value: review["permissions"]["storage"].bool
                  ? model.text("Requested", "Angefordert") : model.text("None", "Keiner"))
              if review["permissions"]["agent"] != .null {
                Text(
                  model.text(
                    "Agent access requested; disabled until separately authorized.",
                    "Agent-Zugriff angefordert; bis zur separaten Freigabe deaktiviert."))
              }
              Text(review["capabilities"].array.map(\.string).joined(separator: ", "))
            }
            Button(model.text("Install provider", "Anbieter installieren")) {
              Task {
                await model.action("install", .object(["text": .string(text)]), reload: true)
                reviewing = false
              }
            }.buttonStyle(.borderedProminent)
          }.navigationTitle(model.text("Review provider", "Anbieter prüfen")).toolbar {
            ToolbarItem(placement: .cancellationAction) {
              Button(model.text("Cancel", "Abbrechen")) { reviewing = false }
            }
          }
        }
      }
  }
  func inspect() async {
    do {
      review = try await model.call("review", .object(["text": .string(text)]))
      reviewing = true
    } catch { model.error = error.localizedDescription }
  }
}
struct DirectStreamForm: View {
  @EnvironmentObject var model: AppModel
  @State private var address = ""
  var body: some View {
    TextField("https://…", text: $address).autocorrectionDisabled()
    Button(model.text("Open stream", "Stream öffnen")) {
      Task {
        await model.play(
          .object([
            "providerId": .string("direct"), "id": .string(address),
            "title": .string(model.text("Direct stream", "Direkter Stream")),
            "type": .string("movie"),
          ]))
      }
    }
  }
}
struct ProviderSettingsScreen: View {
  @EnvironmentObject var model: AppModel
  let manifest: JSONValue
  @State private var values: [String: JSONValue] = [:]
  var id: String { manifest["id"].string }
  var enabled: Bool { model.state["enabledProviders"].array.contains(.string(id)) }
  var body: some View {
    Form {
      Section {
        Toggle(
          model.text("Enabled", "Aktiv"),
          isOn: Binding(
            get: { enabled },
            set: { on in
              Task {
                await model.action(
                  "enable", .object(["id": .string(id), "enabled": .bool(on)]), reload: true)
              }
            }))
      }
      Section(model.text("Connection & settings", "Verbindung & Einstellungen")) {
        ForEach(manifest["settings"].array, id: \.mediaKey) { setting in
          settingControl(setting)
        }
        Button(
          id == "io.github.iteufel.cinefern.jellyfin"
            ? model.text("Sign in", "Anmelden")
            : model.text("Save settings", "Einstellungen speichern")
        ) {
          Task {
            await model.action(
              "providerSettings", .object(["id": .string(id), "settings": .object(values)]),
              reload: true)
            values["password"] = .string("")
          }
        }
        if id == "io.github.iteufel.cinefern.jellyfin" {
          Button(model.text("Disconnect", "Trennen"), role: .destructive) {
            Task { await model.action("disconnectJellyfin", reload: true) }
          }
        }
      }
      Section(model.text("Permissions", "Berechtigungen")) {
        ForEach(manifest["permissions"]["network"].array, id: \.string) { Text($0.string) }
        if manifest["permissions"]["storage"].bool {
          Text(model.text("Private storage allowed", "Privater Speicher erlaubt"))
        }
        if manifest["permissions"]["agent"] != .null {
          Toggle(
            model.text("Allow paid agent access", "Kostenpflichtigen Agent-Zugriff erlauben"),
            isOn: Binding(
              get: {
                model.snapshot["agent"]["grants"].array.contains {
                  $0.string.hasPrefix(id + "@" + manifest["version"].string + ":")
                }
              },
              set: { allowed in
                Task {
                  await model.action(
                    "agentGrant", .object(["id": .string(id), "allowed": .bool(allowed)]))
                }
              }))
          Text(manifest["permissions"]["agent"].array.map(\.string).joined(separator: ", ")).font(
            .caption)
        }
        if manifest["capabilities"].array.contains(.string("watchlist")) {
          Button(model.text("Import provider watchlist", "Anbieter-Merkliste importieren")) {
            Task { await model.action("importWatchlist", .object(["id": .string(id)])) }
          }
        }
      }
      if !["io.github.iteufel.cinefern.jellyfin", "io.github.iteufel.cinefern.json-library"]
        .contains(id)
      {
        Button(model.text("Uninstall provider", "Anbieter deinstallieren"), role: .destructive) {
          Task { await model.action("uninstall", .object(["id": .string(id)]), reload: true) }
        }
      }
    }.navigationTitle(manifest["name"].string).onAppear {
      values = model.state["providerSettings"][id].object
      for setting in manifest["settings"].array where values[setting["id"].string] == nil {
        values[setting["id"].string] = setting["default"]
      }
    }
  }
  @ViewBuilder func settingControl(_ setting: JSONValue) -> some View {
    let key = setting["id"].string
    let label = setting["label"].string
    switch setting["type"].string {
    case "boolean":
      Toggle(
        label, isOn: Binding(get: { values[key]?.bool ?? false }, set: { values[key] = .bool($0) }))
    case "number":
      TextField(
        label,
        text: Binding(
          get: { values[key]?.double.formatted() ?? "" },
          set: { values[key] = .number(Double($0) ?? 0) }))
    case "password":
      SecureField(
        label, text: Binding(get: { values[key]?.string ?? "" }, set: { values[key] = .string($0) })
      )
    case "select":
      Picker(
        label,
        selection: Binding(get: { values[key]?.string ?? "" }, set: { values[key] = .string($0) })
      ) {
        ForEach(setting["options"].array, id: \.mediaKey) { option in
          Text(option["label"].string).tag(option["value"].string)
        }
      }
    default:
      TextField(
        label, text: Binding(get: { values[key]?.string ?? "" }, set: { values[key] = .string($0) })
      ).autocorrectionDisabled()
    }
    if !setting["description"].string.isEmpty {
      Text(setting["description"].string).font(.caption).foregroundStyle(.secondary)
    }
  }
}
