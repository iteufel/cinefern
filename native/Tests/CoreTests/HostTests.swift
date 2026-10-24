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
  func testNativeCompletionsKeepJavaScriptOnOneBackgroundThread() async throws {
    let recorded = RuntimeThreads()
    let host = JavaScriptHost(
      storage: MemoryStorage(),
      transport: { _, completion in
        recorded.capture()
        DispatchQueue.global().asyncAfter(deadline: .now() + 0.01) {
          completion(
            .success(
              .object([
                "status": .number(200), "ok": .bool(true), "headers": .object([:]),
                "body": .string("fixture"),
              ])))
        }
      })
    _ = try await host.call("boot")
    for _ in 0..<12 {
      let result = try await host.call(
        "document", .object(["url": .string("https://example.com/fixture")]))
      XCTAssertEqual(result.string, "fixture")
    }
    await host.close()
    recorded.verify()
  }

}

private final class RuntimeThreads: @unchecked Sendable {
  private let lock = NSLock()
  private var ids = Set<ObjectIdentifier>()
  private var names = Set<String>()
  private var calls = 0
  private var main = false
  func capture() {
    lock.lock()
    defer { lock.unlock() }
    ids.insert(ObjectIdentifier(Thread.current))
    names.insert(Thread.current.name ?? "")
    main = main || Thread.isMainThread
    calls += 1
  }
  func verify() {
    lock.lock()
    defer { lock.unlock() }
    XCTAssertEqual(calls, 12)
    XCTAssertEqual(ids.count, 1)
    XCTAssertEqual(names, ["org.cinefern.provider-runtime"])
    XCTAssertFalse(main)
  }
}
