import XCTest

@testable import CinefernCore

final class HostTests: XCTestCase {
  func testBootAndPersistenceAcrossContexts() async throws {
    let storage = MemoryStorage()
    let host = JavaScriptHost(storage: storage)
    let boot = try await host.call("boot")
    XCTAssertEqual(boot["state"]["version"], .number(1))
    XCTAssertFalse(boot["agent"]["enabled"].bool)
    _ = try await host.call("setup")
    _ = try await host.call("settings", .object(["language": .string("de")]))
    await host.close()
    let restored = JavaScriptHost(storage: storage)
    let result = try await restored.call("boot")
    XCTAssertTrue(result["state"]["setupComplete"].bool)
    XCTAssertEqual(result["state"]["settings"]["language"], .string("de"))
    await restored.close()
  }
}
