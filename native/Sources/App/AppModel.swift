import Combine
import SwiftUI

@MainActor final class AppModel: ObservableObject {
  @Published var snapshot: JSONValue = .null
  @Published var feeds: [JSONValue] = []
  @Published var error: String?
  @Published var ready = false
  @Published var busy = false
  @Published var playback: PlaybackSession?
  private var started = false
  private var host: JavaScriptHost?
  var state: JSONValue { snapshot["state"] }
  var settings: JSONValue { state["settings"] }
  var german: Bool { settings["language"].string == "de" }
  func text(_ english: String, _ german: String) -> String { self.german ? german : english }
  func boot() async {
    guard !started else { return }
    started = true
    do {
      host = try await Task.detached(priority: .userInitiated) {
        JavaScriptHost(storage: try EncryptedStorage())
      }.value
      snapshot = try await call("boot")
      ready = true
      await reloadHome()
    } catch { self.error = error.localizedDescription }
  }
  func call(_ operation: String, _ value: JSONValue = .object([:])) async throws -> JSONValue {
    guard let host else { throw NativeFailure("Runtime unavailable.") }
    return try await host.call(operation, value)
  }
  func action(_ operation: String, _ value: JSONValue = .object([:]), reload: Bool = false) async {
    do {
      let result = try await call(operation, value)
      if result["state"] != .null { snapshot = result }
      if reload { await reloadHome() }
    } catch { self.error = error.localizedDescription }
  }
  func reloadHome() async {
    do { feeds = try await call("home").array } catch { self.error = error.localizedDescription }
  }
  func providerCall(_ item: JSONValue, _ method: String, _ args: [JSONValue]) async throws
    -> JSONValue
  {
    try await call(
      "call",
      .object(["providerId": item["providerId"], "method": .string(method), "args": .array(args)]))
  }
  func play(_ item: JSONValue, queue: [JSONValue]? = nil, trailer: Bool = false) async {
    guard !busy else { return }
    busy = true
    defer { busy = false }
    do {
      let engine = PlayerEngine.saved
      guard engine != .vlc || PlayerEngine.vlcAvailable else {
        throw NativeFailure("VLC is unavailable in this build. Choose AVKit in Settings.")
      }
      let result = try await call(
        "play",
        .object(["item": item, "engine": .string(engine.rawValue), "trailer": .bool(trailer)]))
      let session = try await PlaybackSession(
        item: item, selection: result, queue: queue ?? [item], engine: engine, trailer: trailer,
        preferences: settings)
      session.onProgress = { [weak self, weak session] position, duration in
        guard let self, let session, !session.trailer else { return }
        Task {
          await self.action(
            "progress",
            .object([
              "item": session.item, "position": .number(position), "duration": .number(duration),
            ]))
        }
      }
      session.onEnded = { [weak self, weak session] in
        guard let self, let session, !session.trailer, self.settings["autoplay"].bool else {
          return
        }
        Task { await self.advance(session, offset: 1) }
      }
      session.volume = Float(settings["volume"].double)
      playback = session
    } catch { self.error = error.localizedDescription }
  }
  func advance(_ session: PlaybackSession, offset: Int) async {
    let index = session.queue.firstIndex { $0.mediaKey == session.item.mediaKey } ?? 0
    guard session.queue.indices.contains(index + offset) else { return }
    session.stop()
    playback = nil
    await play(session.queue[index + offset], queue: session.queue)
  }
  func changeSource(_ source: JSONValue, session: PlaybackSession) {
    Task {
      do {
        try await session.load(source, at: session.position, playing: session.playbackRequested)
      } catch { session.failure = error.localizedDescription }
    }
  }
  func changeAudio(_ track: String, session: PlaybackSession) async {
    do {
      let selected = try await call(
        "play",
        .object([
          "item": session.item, "engine": .string(session.engine.rawValue),
          "preferences": .object(["audioTrackId": .string(track)]),
        ]))
      session.sources = selected["sources"].array
      try await session.load(
        selected["source"], at: session.position, playing: session.playbackRequested)
    } catch { self.error = error.localizedDescription }
  }
}
