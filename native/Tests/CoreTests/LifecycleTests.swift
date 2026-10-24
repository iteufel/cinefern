import XCTest

@testable import CinefernCore

final class LifecycleTests: XCTestCase {
  func testInitializeDisposeAndReconfigureUseOriginalLifecycle() async throws {
    let storage = MemoryStorage()
    let host = JavaScriptHost(storage: storage)
    _ = try await host.call("boot")
    let code = """
      var CinefernProvider={create:function(c){
        function append(event){return c.storage.get('events').then(function(value){return c.storage.set('events',(value||'')+event+';');});}
        return {initialize:function(){return append('initialize');},dispose:function(){return append('dispose');},getItem:function(id){return {id:id,providerId:'org.test.lifecycle',title:'Fixture',type:'movie'};}};
      }};
      """
    let bundle: JSONValue = .object([
      "format": .string("cinefern-provider"), "code": .string(code),
      "manifest": .object([
        "id": .string("org.test.lifecycle"), "name": .string("Fixture"),
        "version": .string("1.0.0"), "description": .string("Fixture"), "author": .string("Tests"),
        "apiVersion": .number(1), "capabilities": .array([]),
        "permissions": .object(["network": .array([]), "storage": .bool(true)]),
      ]),
    ])
    _ = try await host.call("install", .object(["text": .string(try bundle.encoded())]))
    _ = try await host.call(
      "enable", .object(["id": .string("org.test.lifecycle"), "enabled": .bool(true)]))
    _ = try await host.call(
      "providerSettings", .object(["id": .string("org.test.lifecycle"), "settings": .object([:])]))
    _ = try await host.call(
      "enable", .object(["id": .string("org.test.lifecycle"), "enabled": .bool(false)]))
    XCTAssertEqual(
      try storage.get("cinefern.provider.org.test.lifecycle.events"),
      "initialize;dispose;initialize;dispose;")
    _ = try await host.call(
      "enable", .object(["id": .string("org.test.lifecycle"), "enabled": .bool(true)]))
    _ = try await host.call("uninstall", .object(["id": .string("org.test.lifecycle")]))
    XCTAssertEqual(
      try storage.get("cinefern.provider.org.test.lifecycle.events"),
      "initialize;dispose;initialize;dispose;initialize;dispose;")
    await host.close()
  }
}
