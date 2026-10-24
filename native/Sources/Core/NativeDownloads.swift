import Foundation

/// Files remain inside this host's media directory. tvOS uses purgeable caches.
final class NativeDownloads: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
  private let lock = NSLock()
  private var completions: [Int: (Result<JSONValue, Error>) -> Void] = [:]
  private var identifiers: [String: URLSessionDownloadTask] = [:]
  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.httpShouldSetCookies = false
    config.urlCredentialStorage = nil
    return URLSession(configuration: config, delegate: self, delegateQueue: nil)
  }()
  private func directory() throws -> URL {
    #if os(tvOS)
      let kind: FileManager.SearchPathDirectory = .cachesDirectory
    #else
      let kind: FileManager.SearchPathDirectory = .applicationSupportDirectory
    #endif
    let result = try FileManager.default.url(
      for: kind, in: .userDomainMask, appropriateFor: nil, create: true
    ).appendingPathComponent("CinefernNative/media", isDirectory: true)
    try FileManager.default.createDirectory(at: result, withIntermediateDirectories: true)
    return result
  }
  func local(_ uri: String) throws -> URL {
    guard let url = URL(string: uri), url.isFileURL,
      url.deletingLastPathComponent().standardizedFileURL == (try directory()).standardizedFileURL
    else { throw NativeFailure("Invalid local media path.") }
    return url
  }
  func remove(_ uri: String) throws {
    let url = try local(uri)
    if FileManager.default.fileExists(atPath: url.path) {
      try FileManager.default.removeItem(at: url)
    }
  }
  func start(_ value: JSONValue, completion: @escaping (Result<JSONValue, Error>) -> Void) throws {
    let id = value["id"].string
    guard id.range(of: "^[a-zA-Z0-9-]+$", options: .regularExpression) != nil,
      let url = URL(string: value["url"].string), ["http", "https"].contains(url.scheme ?? ""),
      url.user == nil, url.password == nil
    else { throw NativeFailure("Invalid download.") }
    var request = URLRequest(url: url)
    for (key, v) in value["headers"].object { request.setValue(v.string, forHTTPHeaderField: key) }
    let task = session.downloadTask(with: request)
    task.taskDescription = id
    lock.lock()
    completions[task.taskIdentifier] = completion
    identifiers[id] = task
    lock.unlock()
    task.resume()
  }
  func cancel(_ id: String) {
    lock.lock()
    let task = identifiers[id]
    lock.unlock()
    task?.cancel()
  }
  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) { completionHandler(nil) }
  func urlSession(
    _ session: URLSession, downloadTask: URLSessionDownloadTask,
    didFinishDownloadingTo location: URL
  ) {
    do {
      guard let response = downloadTask.response as? HTTPURLResponse,
        (200..<300).contains(response.statusCode)
      else { throw NativeFailure("Download failed.") }
      let file = try directory().appendingPathComponent(
        (downloadTask.taskDescription ?? UUID().uuidString) + ".media")
      if FileManager.default.fileExists(atPath: file.path) {
        try FileManager.default.removeItem(at: file)
      }
      try FileManager.default.moveItem(at: location, to: file)
      let size =
        (try FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber)?
        .doubleValue ?? 0
      finish(
        downloadTask,
        .success(.object(["uri": .string(file.absoluteString), "bytes": .number(size)])))
    } catch { finish(downloadTask, .failure(error)) }
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if let error { finish(task, .failure(error)) }
  }
  private func finish(_ task: URLSessionTask, _ result: Result<JSONValue, Error>) {
    lock.lock()
    let completion = completions.removeValue(forKey: task.taskIdentifier)
    identifiers.removeValue(forKey: task.taskDescription ?? "")
    lock.unlock()
    completion?(result)
  }
  func close() { session.invalidateAndCancel() }
}
