import Foundation
import JavaScriptCore
import Security

/// All JSContext/JSValue access is confined to one dedicated background thread.
/// Only JSON crosses the UI boundary; third-party code stays inside the existing interpreter.
public final class JavaScriptHost: @unchecked Sendable {
  private let queue = JavaScriptExecutor()
  private let timerQueue = DispatchQueue(label: "org.cinefern.provider-timers")
  private var context: JSContext?
  private var callbacks: [String: CheckedContinuation<JSONValue, Error>] = [:]
  private var timeouts: [String: DispatchWorkItem] = [:]
  private var timers: [Int: DispatchSourceTimer] = [:]
  private let storage: NativeStorage
  private let http = NativeHTTP()
  private let downloads = NativeDownloads()
  private let transport: ((JSONValue, @escaping (Result<JSONValue, Error>) -> Void) -> Void)?
  private var startupError: Error?
  private var closed = false
  public init(
    storage: NativeStorage, runtimeURL: URL? = nil,
    transport: ((JSONValue, @escaping (Result<JSONValue, Error>) -> Void) -> Void)? = nil
  ) {
    self.storage = storage
    self.transport = transport
    queue.async { [self] in
      do {
        #if SWIFT_PACKAGE
          let url = runtimeURL ?? Bundle.module.url(forResource: "runtime", withExtension: "js")
        #else
          let url = runtimeURL ?? Bundle.main.url(forResource: "runtime", withExtension: "js")
        #endif
        guard let url else { throw NativeFailure("Build native JavaScript resources first.") }
        guard let js = JSContext() else { throw NativeFailure("JavaScriptCore unavailable.") }
        context = js
        js.exceptionHandler = { [weak self] _, value in
          self?.startupError = NativeFailure(value?.toString() ?? "JavaScript error")
        }
        let sync: @convention(block) (String, String) -> String = { operation, json in
          if operation == "uuid" {
            return (try? JSONValue.string(UUID().uuidString).encoded()) ?? "null"
          }
          if operation == "random" {
            let count = min(65536, max(0, Int((try? JSONValue.parse(json)["count"].double) ?? 0)))
            var bytes = [UInt8](repeating: 0, count: count)
            guard SecRandomCopyBytes(kSecRandomDefault, count, &bytes) == errSecSuccess else {
              return "null"
            }
            return (try? JSONValue.array(bytes.map { .number(Double($0)) }).encoded()) ?? "null"
          }
          return "null"
        }
        let async: @convention(block) (String, String, String) -> Void = {
          [weak self] id, operation, json in
          guard let self else { return }
          do { try self.handle(id, operation, JSONValue.parse(json)) } catch {
            self.complete(id, .failure(error))
          }
        }
        js.setObject(sync, forKeyedSubscript: "__nativeSync" as NSString)
        js.setObject(async, forKeyedSubscript: "__nativeAsync" as NSString)
        js.evaluateScript(try String(contentsOf: url, encoding: .utf8), withSourceURL: url)
        if let error = startupError { throw error }
        guard js.objectForKeyedSubscript("CinefernNative")?.isUndefined == false else {
          throw NativeFailure("Native runtime did not initialize.")
        }
      } catch { startupError = error }
    }
  }
  public func call(_ operation: String, _ value: JSONValue = .object([:])) async throws -> JSONValue
  {
    try await withCheckedThrowingContinuation { continuation in
      queue.async { [self] in
        guard !closed else {
          continuation.resume(throwing: NativeFailure("Runtime closed."))
          return
        }
        if let error = startupError {
          continuation.resume(throwing: error)
          return
        }
        let id = UUID().uuidString
        callbacks[id] = continuation
        let timeout = DispatchWorkItem { [weak self] in
          guard let self, let pending = self.callbacks.removeValue(forKey: id) else { return }
          self.timeouts.removeValue(forKey: id)
          pending.resume(throwing: NativeFailure("Native request timed out."))
        }
        timeouts[id] = timeout
        queue.asyncAfter(deadline: .now() + 150, execute: timeout)
        do {
          context?.objectForKeyedSubscript("CinefernNative")?.invokeMethod(
            "dispatch", withArguments: [id, operation, try value.encoded()])
          if let exception = context?.exception {
            context?.exception = nil
            timeouts.removeValue(forKey: id)?.cancel()
            callbacks.removeValue(forKey: id)?.resume(
              throwing: NativeFailure(exception.toString() ?? "JavaScript error"))
          }
        } catch {
          timeouts.removeValue(forKey: id)?.cancel()
          callbacks.removeValue(forKey: id)?.resume(throwing: error)
        }
      }
    }
  }
  private func complete(_ id: String, _ result: Result<JSONValue, Error>) {
    queue.async { [weak self] in
      guard let self, !self.closed else { return }
      let envelope: JSONValue
      switch result {
      case .success(let value): envelope = .object(["value": value])
      case .failure:
        envelope = .object([
          "error": .string("Native operation failed. Check the URL, connection, or storage access.")
        ])
      }
      self.context?.objectForKeyedSubscript("__nativeComplete")?.call(withArguments: [
        id, (try? envelope.encoded()) ?? "null",
      ])
    }
  }
  private func handle(_ id: String, _ operation: String, _ value: JSONValue) throws {
    switch operation {
    case "reply":
      let token = value["id"].string
      timeouts.removeValue(forKey: token)?.cancel()
      let callback = callbacks.removeValue(forKey: token)
      if value["error"] != .null {
        callback?.resume(throwing: NativeFailure(value["error"].string))
      } else {
        callback?.resume(returning: value["value"])
      }
      complete(id, .success(.null))
    case "timer":
      let number = Int(value["id"].double)
      let timer = DispatchSource.makeTimerSource(queue: timerQueue)
      let delay = max(0.001, value["milliseconds"].double / 1000)
      if value["repeating"].bool {
        timer.schedule(deadline: .now() + delay, repeating: delay)
      } else {
        timer.schedule(deadline: .now() + delay)
      }
      timer.setEventHandler { [weak self] in
        // Wait for this delivery so DispatchSource keeps coalescing a busy timer.
        self?.queue.sync { [weak self] in
          guard let self, !self.closed else { return }
          if !value["repeating"].bool { self.timers.removeValue(forKey: number)?.cancel() }
          self.context?.objectForKeyedSubscript("__nativeTimer")?.call(withArguments: [number])
        }
      }
      timers[number] = timer
      timer.resume()
    case "clearTimer": timers.removeValue(forKey: Int(value["id"].double))?.cancel()
    case "storage.get":
      complete(id, .success(try storage.get(value["key"].string).map(JSONValue.string) ?? .null))
    case "storage.set":
      try storage.set(value["key"].string, value: value["value"].string)
      complete(id, .success(.null))
    case "storage.remove":
      try storage.remove(value["key"].string)
      complete(id, .success(.null))
    case "storage.keys": complete(id, .success(.array(try storage.keys().map(JSONValue.string))))
    case "http":
      let completion: (Result<JSONValue, Error>) -> Void = { [weak self] result in
        self?.complete(id, result)
      }
      if let transport {
        transport(value, completion)
      } else {
        http.request(value, completion: completion)
      }
    case "http.cancel":
      http.cancel(value["token"].string)
      complete(id, .success(.null))
    case "download": try downloads.start(value) { [weak self] result in self?.complete(id, result) }
    case "download.cancel":
      downloads.cancel(value["id"].string)
      complete(id, .success(.null))
    case "download.remove":
      try downloads.remove(value["uri"].string)
      complete(id, .success(.null))
    case "download.local":
      let url = try downloads.local(value["uri"].string)
      guard FileManager.default.fileExists(atPath: url.path) else {
        throw NativeFailure("Downloaded file was removed. Retry the download.")
      }
      complete(id, .success(.string(url.absoluteString)))
    default: throw NativeFailure("Unknown host operation.")
    }
  }
  public func close() async {
    await withCheckedContinuation { continuation in
      queue.async { [self] in
        closed = true
        timers.values.forEach { $0.cancel() }
        timers.removeAll()
        timeouts.values.forEach { $0.cancel() }
        timeouts.removeAll()
        callbacks.values.forEach { $0.resume(throwing: NativeFailure("Runtime closed.")) }
        callbacks.removeAll()
        http.close()
        downloads.close()
        context = nil
        continuation.resume()
      }
    }
  }
}

/// Serial ownership also preserves OS-thread identity across native completions/timers.
/// No JS value leaves this executor and no JIT/security configuration is changed.
private final class JavaScriptExecutor: @unchecked Sendable {
  private final class State: @unchecked Sendable {
    let condition = NSCondition()
    var jobs: [() -> Void] = []
    var closed = false
    func next() -> (() -> Void)? {
      condition.lock()
      defer { condition.unlock() }
      while jobs.isEmpty && !closed { condition.wait() }
      guard !closed else { return nil }
      return jobs.removeFirst()
    }
  }
  private let state = State()
  private let thread: Thread
  init() {
    let state = self.state
    thread = Thread {
      while let job = state.next() { autoreleasepool(invoking: job) }
    }
    thread.name = "org.cinefern.provider-runtime"
    thread.qualityOfService = .userInitiated
    thread.start()
  }
  func async(execute job: @escaping () -> Void) {
    state.condition.lock()
    if !state.closed { state.jobs.append(job) }
    state.condition.signal()
    state.condition.unlock()
  }
  func sync(execute job: @escaping () -> Void) {
    let finished = DispatchSemaphore(value: 0)
    async {
      job()
      finished.signal()
    }
    finished.wait()
  }
  func asyncAfter(deadline: DispatchTime, execute work: DispatchWorkItem) {
    DispatchQueue.global(qos: .userInitiated).asyncAfter(deadline: deadline) { [weak self] in
      self?.async { if !work.isCancelled { work.perform() } }
    }
  }
  deinit {
    state.condition.lock()
    state.closed = true
    state.jobs.removeAll()
    state.condition.signal()
    state.condition.unlock()
  }
}
