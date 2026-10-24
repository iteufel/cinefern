import XCTest

@testable import CinefernCore

final class ProviderTests: XCTestCase {
  func fixture(_ name: String, _ ext: String = "cfprovider") throws -> String {
    try String(
      contentsOf: Bundle.module.url(
        forResource: name, withExtension: ext, subdirectory: "Fixtures")!, encoding: .utf8)
  }
  func install(_ text: String, id: String, host: JavaScriptHost) async throws {
    _ = try await host.call("install", .object(["text": .string(text)]))
    _ = try await host.call("enable", .object(["id": .string(id), "enabled": .bool(true)]))
  }
  func invoke(_ id: String, _ method: String, _ args: [JSONValue], host: JavaScriptHost)
    async throws -> JSONValue
  {
    try await host.call(
      "call", .object(["providerId": .string(id), "method": .string(method), "args": .array(args)]))
  }
  func testUnchangedCatalogBundleRunsInJavaScriptCore() async throws {
    let catalog = try fixture("catalog", "json")
    let host = JavaScriptHost(
      storage: MemoryStorage(),
      transport: { value, completion in
        XCTAssertEqual(value["url"].string, "https://example.com/catalog.json")
        completion(
          .success(
            .object([
              "status": .number(200), "ok": .bool(true), "headers": .object([:]),
              "body": .string(catalog),
            ])))
      })
    _ = try await host.call("boot")
    try await install(fixture("org.example.catalog"), id: "org.example.catalog", host: host)
    let home = try await invoke("org.example.catalog", "getHome", [], host: host)
    XCTAssertEqual(home["featured"].array.first?["title"].string, "My film")
    let page = try await invoke(
      "org.example.catalog", "search", [.object(["query": .string("film"), "limit": .number(10)])],
      host: host)
    XCTAssertEqual(page["items"].array.count, 1)
    let sources = try await invoke(
      "org.example.catalog", "getSources", [.string("my-film"), .object([:])], host: host)
    XCTAssertEqual(sources.array.first?["quality"], .number(1080))
    _ = try await host.call(
      "providerSettings",
      .object([
        "id": .string("org.example.catalog"),
        "settings": .object(["catalogUrl": .string("https://evil.example/catalog.json")]),
      ]))
    do {
      _ = try await invoke("org.example.catalog", "getHome", [], host: host)
      XCTFail("Cross-origin request was allowed")
    } catch { XCTAssertTrue(error.localizedDescription.contains("not permitted")) }
    _ = try await host.call(
      "enable", .object(["id": .string("org.example.catalog"), "enabled": .bool(false)]))
    do {
      _ = try await invoke("org.example.catalog", "getHome", [], host: host)
      XCTFail("Disabled provider was callable")
    } catch { XCTAssertTrue(error.localizedDescription.contains("unavailable")) }
    await host.close()
  }
  func bundle(_ id: String, code: String, storage: Bool = true) -> JSONValue {
    .object([
      "format": .string("cinefern-provider"), "code": .string(code),
      "manifest": .object([
        "id": .string(id), "name": .string("Fixture"), "description": .string("Fixture"),
        "author": .string("Tests"), "version": .string("1.0.0"), "apiVersion": .number(1),
        "capabilities": .array([]),
        "permissions": .object(["network": .array([]), "storage": .bool(storage)]),
      ]),
    ])
  }
  func testStorageIsolationPermissionAndExecutionQuota() async throws {
    let storage = MemoryStorage()
    let host = JavaScriptHost(storage: storage)
    _ = try await host.call("boot")
    for (id, title) in [("org.test.one", "one"), ("org.test.two", "two")] {
      let code =
        "var CinefernProvider={create:function(c){return {getItem:function(id){return c.storage.set('key','\(title)').then(function(){return c.storage.get('key');}).then(function(value){return {id:id,providerId:'\(id)',title:value,type:'movie'};});}};}};"
      try await install(bundle(id, code: code).encoded(), id: id, host: host)
      let result = try await invoke(id, "getItem", [.string("film")], host: host)
      XCTAssertEqual(result["title"].string, title)
    }
    XCTAssertEqual(try storage.get("cinefern.provider.org.test.one.key"), "one")
    XCTAssertEqual(try storage.get("cinefern.provider.org.test.two.key"), "two")
    let denied = "org.test.denied"
    let code =
      "var CinefernProvider={create:function(c){return {getItem:function(id){return c.storage.get('key');}};}};"
    try await install(bundle(denied, code: code, storage: false).encoded(), id: denied, host: host)
    do {
      _ = try await invoke(denied, "getItem", [.string("film")], host: host)
      XCTFail("Storage permission bypass")
    } catch { XCTAssertTrue(error.localizedDescription.contains("storage permission")) }
    let loop =
      "var CinefernProvider={create:function(c){return {getItem:function(id){while(true){};}};}};"
    try await install(
      bundle("org.test.loop", code: loop).encoded(), id: "org.test.loop", host: host)
    do {
      _ = try await invoke("org.test.loop", "getItem", [.string("film")], host: host)
      XCTFail("Unbounded interpreter loop")
    } catch { XCTAssertTrue(error.localizedDescription.lowercased().contains("quota")) }
    _ = try await host.call("snapshot")  // Queue must remain usable after quota exhaustion.
    await host.close()
  }
  func testUnchangedAgentBundleHonorsDefaultDeny() async throws {
    let host = JavaScriptHost(
      storage: MemoryStorage(),
      transport: { _, _ in XCTFail("Agent network access without permission") })
    _ = try await host.call("boot")
    try await install(
      fixture("org.cinefern.media-research"), id: "org.cinefern.media-research", host: host)
    do {
      _ = try await invoke(
        "org.cinefern.media-research", "search",
        [.object(["query": .string("Sintel"), "limit": .number(1)])], host: host)
      XCTFail("Agent default-deny bypass")
    } catch { XCTAssertTrue(error.localizedDescription.contains("Enable the media agent")) }
    await host.close()
  }
  func testAgentEngineAndUnchangedResearchPluginWithScriptedHTTP() async throws {
    final class Script: @unchecked Sendable {
      let lock = NSLock()
      var calls = 0
      func next(_ value: JSONValue) -> JSONValue {
        lock.lock()
        defer { lock.unlock() }
        let url = value["url"].string
        let body: String
        if url == "https://example.com/film" {
          body = "<title>Sintel</title><p>Sintel is a film released in 2010.</p>"
        } else {
          XCTAssertEqual(url, "https://openrouter.ai/api/v1/chat/completions")
          calls += 1
          if calls == 1 {
            body =
              #"{"id":"fixture","object":"chat.completion","created":1,"model":"fixture","choices":[{"index":0,"finish_reason":"tool_calls","message":{"role":"assistant","content":null,"tool_calls":[{"id":"call_1","type":"function","function":{"name":"browser_open","arguments":"{\"url\":\"https://example.com/film\"}"}}]}}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}"#
          } else {
            let answer =
              #"{"text":"Verified Sintel.","data":{"items":[{"title":"Sintel","type":"movie","year":2010,"url":"https://example.com/film"}]}}"#
            body =
              (try? JSONValue.object([
                "id": .string("fixture-final"), "object": .string("chat.completion"),
                "created": .number(1), "model": .string("fixture"),
                "choices": .array([
                  .object([
                    "index": .number(0), "finish_reason": .string("stop"),
                    "message": .object(["role": .string("assistant"), "content": .string(answer)]),
                  ])
                ]),
                "usage": .object([
                  "prompt_tokens": .number(1), "completion_tokens": .number(1),
                  "total_tokens": .number(2),
                ]),
              ]).encoded()) ?? ""
          }
        }
        return .object([
          "status": .number(200), "ok": .bool(true),
          "headers": .object([
            "content-type": .string(url.contains("openrouter") ? "application/json" : "text/html")
          ]), "body": .string(body),
        ])
      }
    }
    let script = Script()
    let host = JavaScriptHost(
      storage: MemoryStorage(),
      transport: { value, completion in completion(.success(script.next(value))) })
    let boot = try await host.call("boot")
    try await install(
      fixture("org.cinefern.media-research"), id: "org.cinefern.media-research", host: host)
    var settings = boot["agent"]
    settings["enabled"] = .bool(true)
    settings["backend"] = .string("openrouter")
    settings["webSearch"] = .bool(false)
    _ = try await host.call("agentSettings", settings)
    _ = try await host.call(
      "agentKey",
      .object(["backend": .string("openrouter"), "key": .string("fixture-key-not-real")]))
    _ = try await host.call(
      "agentGrant", .object(["id": .string("org.cinefern.media-research"), "allowed": .bool(true)]))
    let result = try await invoke(
      "org.cinefern.media-research", "search",
      [.object(["query": .string("Sintel"), "limit": .number(1)])], host: host)
    XCTAssertEqual(result["items"].array.first?["title"].string, "Sintel")
    XCTAssertEqual(script.calls, 2)
    let item = try await invoke(
      "org.cinefern.media-research", "getItem", [.string("https://example.com/film")], host: host)
    XCTAssertEqual(item["title"].string, "Sintel")
    _ = try await host.call(
      "agentGrant",
      .object(["id": .string("org.cinefern.media-research"), "allowed": .bool(false)]))
    do {
      _ = try await invoke(
        "org.cinefern.media-research", "search",
        [.object(["query": .string("Sintel"), "limit": .number(1)])], host: host)
      XCTFail("Revoked grant bypass")
    } catch { XCTAssertTrue(error.localizedDescription.contains("Allow agent access")) }
    await host.close()
  }
}
