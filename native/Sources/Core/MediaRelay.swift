import Foundation
import Network

/// Per-playback, loopback-only HTTP relay. Player URLs contain an unguessable capability,
/// never provider headers. Credentials are sent only to the original source origin.
public final class MediaRelay: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  private let source: URL
  private let headers: [String: String]
  private let queue = DispatchQueue(label: "org.cinefern.media-relay")
  private let lock = NSLock()
  private var listener: NWListener?
  private var port: UInt16?
  private var directories: [String: URL] = [:]
  private var directoryIDs: [URL: String] = [:]
  private var clients: [UUID: NWConnection] = [:]
  private var work: [UUID: Task<Void, Never>] = [:]
  private var closed = false
  private let token = UUID().uuidString
  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.httpCookieStorage = nil
    config.httpShouldSetCookies = false
    config.urlCredentialStorage = nil
    config.urlCache = nil
    config.timeoutIntervalForRequest = 45
    config.timeoutIntervalForResource = 86400
    return URLSession(configuration: config, delegate: self, delegateQueue: nil)
  }()

  public init(source: URL, headers: [String: String]) throws {
    guard Self.valid(source), headers.count <= 64 else {
      throw NativeFailure("Invalid media source.")
    }
    let reserved = Set([
      "host", "connection", "content-length", "transfer-encoding", "range", "if-range",
      "accept-encoding", "te", "trailer", "upgrade", "proxy-authorization", "proxy-connection",
    ])
    let tokenCharacters = Set(
      "!#$%&'*+-.^_`|~0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".utf8)
    var names = Set<String>()
    var count = 0
    for (key, value) in headers {
      count += key.utf8.count + value.utf8.count
      guard !key.isEmpty, key.utf8.allSatisfy(tokenCharacters.contains),
        names.insert(key.lowercased()).inserted,
        !reserved.contains(key.lowercased()),
        value.unicodeScalars.allSatisfy({ $0.value >= 32 && $0.value != 127 }),
        count <= 32768
      else { throw NativeFailure("Invalid media request headers.") }
    }
    self.source = source
    self.headers = headers
  }

  public static func valid(_ url: URL) -> Bool {
    ["http", "https"].contains(url.scheme?.lowercased() ?? "") && url.host != nil && url.user == nil
      && url.password == nil
  }
  public static func origin(_ url: URL) -> String {
    "\(url.scheme?.lowercased() ?? "")://\(url.host?.lowercased() ?? ""):\(url.port ?? (url.scheme == "https" ? 443 : 80))"
  }
  public func start() async throws -> URL {
    try await withCheckedThrowingContinuation { continuation in
      queue.async { [self] in
        guard !lock.withLock({ closed }) else {
          continuation.resume(throwing: NativeFailure("Media relay stopped."))
          return
        }
        do {
          let parameters = NWParameters.tcp
          parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
          let server = try NWListener(using: parameters)
          listener = server
          var completed = false
          func finish(_ result: Result<URL, Error>) {
            guard !completed else { return }
            completed = true
            continuation.resume(with: result)
          }
          server.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
              self.lock.lock()
              self.port = server.port?.rawValue
              self.lock.unlock()
              do { finish(.success(try self.localURL(for: self.source))) } catch {
                finish(.failure(error))
              }
            case .failed: finish(.failure(NativeFailure("Media relay could not start.")))
            case .cancelled: finish(.failure(NativeFailure("Media relay stopped.")))
            default: break
            }
          }
          server.newConnectionHandler = { [weak self] client in self?.accept(client) }
          server.start(queue: queue)
          queue.asyncAfter(deadline: .now() + 5) {
            if !completed {
              server.cancel()
              finish(.failure(NativeFailure("Media relay startup timed out.")))
            }
          }
        } catch { continuation.resume(throwing: error) }
      }
    }
  }
  /// Maps a known manifest resource to a private route. No arbitrary URL is accepted from a client.
  public func localURL(for remote: URL) throws -> URL {
    guard Self.valid(remote) else { throw NativeFailure("Invalid manifest resource URL.") }
    let directory = remote.hasDirectoryPath ? remote : remote.deletingLastPathComponent()
    lock.lock()
    defer { lock.unlock() }
    guard !closed, let port else { throw NativeFailure("Media relay is unavailable.") }
    guard directoryIDs[directory] != nil || directories.count < 8192 else {
      throw NativeFailure("Too many manifest resource directories.")
    }
    let id = directoryIDs[directory] ?? UUID().uuidString
    directories[id] = directory
    directoryIDs[directory] = id
    guard let parts = URLComponents(url: remote, resolvingAgainstBaseURL: true) else {
      throw NativeFailure("Invalid manifest URL.")
    }
    var local = URLComponents()
    local.scheme = "http"
    local.host = "127.0.0.1"
    local.port = Int(port)
    let filename =
      parts.percentEncodedPath.split(separator: "/", omittingEmptySubsequences: false).last ?? ""
    local.percentEncodedPath = "/\(token)/\(id)/\(filename)"
    local.percentEncodedQuery = parts.percentEncodedQuery
    guard let url = local.url else { throw NativeFailure("Invalid manifest route.") }
    return url
  }
  private func accept(_ client: NWConnection) {
    let id = UUID()
    lock.lock()
    let allowed = !closed && clients.count < 24
    if allowed { clients[id] = client }
    lock.unlock()
    guard allowed else {
      client.cancel()
      return
    }
    client.start(queue: queue)
    client.stateUpdateHandler = { [weak self] state in
      if case .failed = state { self?.remove(id) }
      if case .cancelled = state { self?.remove(id) }
    }
    receive(client, id: id, data: Data())
    queue.asyncAfter(deadline: .now() + 10) { [weak self] in
      guard let self else { return }
      self.lock.lock()
      let waiting = self.clients[id] != nil && self.work[id] == nil
      self.lock.unlock()
      if waiting { self.remove(id) }
    }
  }
  private func receive(_ client: NWConnection, id: UUID, data: Data) {
    client.receive(minimumIncompleteLength: 1, maximumLength: 16384) {
      [weak self] chunk, _, done, error in
      guard let self else { return }
      var data = data
      data.append(chunk ?? Data())
      guard data.count <= 16384, error == nil else {
        self.remove(id)
        return
      }
      if let end = data.range(of: Data("\r\n\r\n".utf8)),
        let head = String(data: data[..<end.lowerBound], encoding: .utf8)
      {
        let task = Task { [weak self] in
          guard let self else { return }
          await self.serve(client, id: id, head: head)
        }
        self.lock.lock()
        self.work[id] = task
        self.lock.unlock()
      } else if done {
        self.remove(id)
      } else {
        self.receive(client, id: id, data: data)
      }
    }
  }
  private func serve(_ client: NWConnection, id: UUID, head: String) async {
    defer { remove(id) }
    var responseStarted = false
    do {
      let lines = head.components(separatedBy: "\r\n")
      let request = (lines.first ?? "").split(separator: " ")
      guard request.count == 3, ["GET", "HEAD"].contains(String(request[0])),
        let local = URLComponents(string: "http://127.0.0.1" + request[1])
      else {
        try await sendStatus(client, 400)
        return
      }
      let path = local.percentEncodedPath.split(separator: "/", omittingEmptySubsequences: true)
      guard path.count >= 2, path[0] == Substring(token) else {
        try await sendStatus(client, 404)
        return
      }
      let directory = lock.withLock { directories[String(path[1])] }
      guard let directory, var remote = URLComponents(url: directory, resolvingAgainstBaseURL: true)
      else {
        try await sendStatus(client, 404)
        return
      }
      let tail = path.dropFirst(2).joined(separator: "/")
      remote.percentEncodedPath =
        remote.percentEncodedPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
          .isEmpty
        ? "/" + tail
        : "/" + remote.percentEncodedPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
          + "/" + tail
      remote.percentEncodedQuery = local.percentEncodedQuery
      guard let url = remote.url, Self.valid(url) else {
        try await sendStatus(client, 400)
        return
      }
      var upstream = URLRequest(url: url)
      upstream.httpMethod = String(request[0])
      upstream.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
      if Self.origin(url) == Self.origin(source) {
        for (key, value) in headers { upstream.setValue(value, forHTTPHeaderField: key) }
      }
      for line in lines.dropFirst() {
        guard let colon = line.firstIndex(of: ":") else { continue }
        let key = String(line[..<colon]).lowercased()
        if ["range", "if-range"].contains(key) {
          upstream.setValue(
            String(line[line.index(after: colon)...]).trimmingCharacters(in: .whitespaces),
            forHTTPHeaderField: key)
        }
      }
      let (bytes, response) = try await session.bytes(for: upstream)
      guard let response = response as? HTTPURLResponse else {
        throw NativeFailure("Invalid media response.")
      }
      // Redirects are not followed, and Location/Set-Cookie are never forwarded to a player.
      guard (200..<300).contains(response.statusCode) else {
        try await sendStatus(client, response.statusCode)
        return
      }
      let mime = response.mimeType ?? "application/octet-stream"
      let manifest = ManifestRewriter.kind(url: url, mime: mime)
      if let manifest, upstream.httpMethod != "HEAD" {
        var data = Data()
        for try await byte in bytes {
          if Task.isCancelled { return }
          guard data.count < 2_000_000 else { throw NativeFailure("Media manifest is too large.") }
          data.append(byte)
        }
        let rewritten = try ManifestRewriter.rewrite(data, kind: manifest, base: url) {
          try self.localURL(for: $0)
        }
        responseStarted = true
        try await send(client, responseHead(status: 200, mime: mime, length: rewritten.count))
        try await send(client, rewritten)
      } else {
        let length = response.expectedContentLength >= 0 ? Int(response.expectedContentLength) : nil
        let chunked = length == nil && upstream.httpMethod != "HEAD"
        var additional: [String: String] = [:]
        for key in ["Content-Range", "Accept-Ranges", "ETag", "Last-Modified"] {
          if let value = response.value(forHTTPHeaderField: key), !value.contains("\r"),
            !value.contains("\n")
          {
            additional[key] = value
          }
        }
        responseStarted = true
        try await send(
          client,
          responseHead(
            status: response.statusCode, mime: mime, length: length, chunked: chunked,
            extra: additional))
        guard upstream.httpMethod != "HEAD" else { return }
        var block = Data()
        block.reserveCapacity(65536)
        for try await byte in bytes {
          if Task.isCancelled { return }
          block.append(byte)
          if block.count == 65536 {
            try await sendBlock(client, block, chunked: chunked)
            block.removeAll(keepingCapacity: true)
          }
        }
        if !block.isEmpty { try await sendBlock(client, block, chunked: chunked) }
        if chunked { try await send(client, Data("0\r\n\r\n".utf8)) }
      }
    } catch { if !responseStarted { try? await sendStatus(client, 502) } }
  }
  private func responseHead(
    status: Int, mime: String, length: Int?, chunked: Bool = false, extra: [String: String] = [:]
  ) -> Data {
    var head =
      "HTTP/1.1 \(status) Media\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Type: \(mime)\r\n"
    if let length { head += "Content-Length: \(length)\r\n" }
    if chunked { head += "Transfer-Encoding: chunked\r\n" }
    for (key, value) in extra { head += "\(key): \(value)\r\n" }
    return Data((head + "\r\n").utf8)
  }
  private func sendStatus(_ client: NWConnection, _ code: Int) async throws {
    try await send(client, responseHead(status: code, mime: "text/plain", length: 0))
  }
  private func sendBlock(_ client: NWConnection, _ data: Data, chunked: Bool) async throws {
    if chunked {
      var block = Data("\(String(data.count, radix: 16))\r\n".utf8)
      block.append(data)
      block.append(Data("\r\n".utf8))
      try await send(client, block)
    } else {
      try await send(client, data)
    }
  }
  private func send(_ client: NWConnection, _ data: Data) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      client.send(
        content: data,
        completion: .contentProcessed { error in
          if let error { continuation.resume(throwing: error) } else { continuation.resume() }
        })
    }
  }
  private func remove(_ id: UUID) {
    lock.lock()
    let client = clients.removeValue(forKey: id)
    let task = work.removeValue(forKey: id)
    lock.unlock()
    client?.cancel()
    task?.cancel()
  }
  public func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) { completionHandler(nil) }
  public func stop() {
    lock.lock()
    closed = true
    let connections = Array(clients.values)
    let tasks = Array(work.values)
    clients.removeAll()
    work.removeAll()
    directories.removeAll()
    directoryIDs.removeAll()
    lock.unlock()
    listener?.stateUpdateHandler = nil
    listener?.newConnectionHandler = nil
    listener?.cancel()
    listener = nil
    connections.forEach { $0.cancel() }
    tasks.forEach { $0.cancel() }
    session.invalidateAndCancel()
  }
}
