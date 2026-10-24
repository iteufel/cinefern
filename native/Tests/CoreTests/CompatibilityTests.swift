import XCTest

@testable import CinefernCore

final class CompatibilityTests: XCTestCase {
  func testBackupMergeAndProgressSurviveRestart() async throws {
    let storage = MemoryStorage()
    let host = JavaScriptHost(storage: storage)
    _ = try await host.call("boot")
    let first: JSONValue = .object([
      "providerId": .string("org.example.films"), "id": .string("one"), "title": .string("One"),
      "type": .string("movie"),
    ])
    let second: JSONValue = .object([
      "providerId": .string("org.example.films"), "id": .string("two"), "title": .string("Two"),
      "type": .string("movie"),
    ])
    _ = try await host.call("save", first)
    _ = try await host.call(
      "progress", .object(["item": first, "position": .number(40), "duration": .number(120)]))
    let backup = try await host.call("export")
    _ = try await host.call("save", second)
    let merged = try await host.call("import", .object(["text": backup]))
    XCTAssertEqual(merged["state"]["watchlist"].array.count, 2)
    XCTAssertEqual(merged["continueWatching"].array.count, 1)
    await host.close()
    let restored = JavaScriptHost(storage: storage)
    let state = try await restored.call("boot")
    XCTAssertEqual(state["state"]["history"].array.first?["position"], .number(40))
    await restored.close()
  }
  func testProviderCannotSeeNativeBridgeAndDirectSourcesAreValidated() async throws {
    let host = JavaScriptHost(storage: MemoryStorage())
    _ = try await host.call("boot")
    let code =
      "var CinefernProvider={create:function(c){return {getItem:function(id){return {providerId:'org.test.globals',id:id,title:typeof __nativeAsync,type:'movie'};}};}};"
    let bundle: JSONValue = .object([
      "format": .string("cinefern-provider"), "code": .string(code),
      "manifest": .object([
        "id": .string("org.test.globals"), "name": .string("Fixture"), "version": .string("1.0.0"),
        "description": .string("Fixture"), "author": .string("Tests"), "apiVersion": .number(1),
        "capabilities": .array([]), "permissions": .object(["network": .array([])]),
      ]),
    ])
    _ = try await host.call("install", .object(["text": .string(try bundle.encoded())]))
    _ = try await host.call(
      "enable", .object(["id": .string("org.test.globals"), "enabled": .bool(true)]))
    let result = try await host.call(
      "call",
      .object([
        "providerId": .string("org.test.globals"), "method": .string("getItem"),
        "args": .array([.string("test")]),
      ]))
    XCTAssertEqual(result["title"].string, "undefined")
    for url in ["file:///etc/passwd", "https://user:password@example.com/stream.mp4"] {
      do {
        _ = try await host.call(
          "play",
          .object([
            "item": .object(["providerId": .string("direct"), "id": .string(url)]),
            "engine": .string("avkit"),
          ]))
        XCTFail("Unsafe source allowed")
      } catch { XCTAssertTrue(error.localizedDescription.contains("HTTP")) }
    }
    let direct: JSONValue = .object([
      "providerId": .string("direct"), "id": .string("https://example.com/stream.mpd"),
    ])
    do {
      _ = try await host.call("play", .object(["item": direct, "engine": .string("avkit")]))
      XCTFail("DASH allowed in AVKit")
    } catch { XCTAssertTrue(error.localizedDescription.contains("No compatible")) }
    let vlc = try await host.call("play", .object(["item": direct, "engine": .string("vlc")]))
    XCTAssertEqual(vlc["source"]["type"].string, "dash")
    await host.close()
  }
}
