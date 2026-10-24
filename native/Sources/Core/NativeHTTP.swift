import Foundation

/// No ambient cookies, cached credentials, redirects, or unbounded response bodies.
/// ProviderRuntime checks exact declared origins before reaching this trusted transport.
public final class NativeHTTP: NSObject, URLSessionDataDelegate, URLSessionTaskDelegate,
  @unchecked Sendable
{
  private let lock = NSLock()
  private struct Transfer {
    var data = Data()
    var response: HTTPURLResponse?
    let limit: Int
    let completion: (Result<JSONValue, Error>) -> Void
  }
  private var transfers: [Int: Transfer] = [:]
  private var tokens: [String: URLSessionTask] = [:]
  private lazy var session: URLSession = {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpShouldSetCookies = false
    configuration.httpCookieStorage = nil
    configuration.urlCredentialStorage = nil
    configuration.urlCache = nil
    configuration.timeoutIntervalForRequest = 45
    configuration.timeoutIntervalForResource = 130
    return URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
  }()
  public func request(_ value: JSONValue, completion: @escaping (Result<JSONValue, Error>) -> Void)
  {
    guard let url = URL(string: value["url"].string),
      ["http", "https"].contains(url.scheme?.lowercased() ?? ""), url.host != nil, url.user == nil,
      url.password == nil
    else {
      completion(.failure(NativeFailure("Invalid HTTP URL.")))
      return
    }
    var request = URLRequest(url: url)
    let options = value["options"]
    request.httpMethod = options["method"].string.isEmpty ? "GET" : options["method"].string
    for (key, v) in options["headers"].object {
      request.setValue(v.string, forHTTPHeaderField: key)
    }
    if options["body"] != .null { request.httpBody = Data(options["body"].string.utf8) }
    let task = session.dataTask(with: request)
    lock.lock()
    transfers[task.taskIdentifier] = Transfer(
      limit: value["limit"].double > 0 ? min(5_000_000, Int(value["limit"].double)) : 5_000_000,
      completion: completion)
    if !value["token"].string.isEmpty { tokens[value["token"].string] = task }
    lock.unlock()
    task.resume()
  }
  public func cancel(_ token: String) {
    lock.lock()
    let task = tokens[token]
    lock.unlock()
    task?.cancel()
  }
  public func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) { completionHandler(nil) }
  public func urlSession(
    _ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    lock.lock()
    let limit = transfers[dataTask.taskIdentifier]?.limit ?? 0
    transfers[dataTask.taskIdentifier]?.response = response as? HTTPURLResponse
    lock.unlock()
    completionHandler(response.expectedContentLength > limit ? .cancel : .allow)
  }
  public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data)
  {
    lock.lock()
    let tooLarge =
      (transfers[dataTask.taskIdentifier]?.data.count ?? 0) + data.count
      > (transfers[dataTask.taskIdentifier]?.limit ?? 0)
    if !tooLarge { transfers[dataTask.taskIdentifier]?.data.append(data) }
    lock.unlock()
    if tooLarge { dataTask.cancel() }
  }
  public func urlSession(
    _ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?
  ) {
    lock.lock()
    let transfer = transfers.removeValue(forKey: task.taskIdentifier)
    tokens = tokens.filter { $0.value.taskIdentifier != task.taskIdentifier }
    lock.unlock()
    guard let transfer else { return }
    if let error {
      transfer.completion(.failure(error))
      return
    }
    guard let response = transfer.response, let body = String(data: transfer.data, encoding: .utf8)
    else {
      transfer.completion(.failure(NativeFailure("Invalid HTTP response.")))
      return
    }
    let headers = Dictionary(
      response.allHeaderFields.map {
        (String(describing: $0.key).lowercased(), JSONValue.string(String(describing: $0.value)))
      }, uniquingKeysWith: { _, new in new })
    transfer.completion(
      .success(
        .object([
          "status": .number(Double(response.statusCode)),
          "ok": .bool((200..<300).contains(response.statusCode)), "body": .string(body),
          "headers": .object(headers),
        ])))
  }
  public func close() { session.invalidateAndCancel() }
}
