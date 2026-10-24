import Foundation
import Network
import XCTest

@testable import CinefernCore

final class MediaRelayTests: XCTestCase {
  func testAuthenticatedBinaryRangeAndHeadUseActualHTTP() async throws {
    let origin = try await TestOrigin.start { request in
      guard request.header("authorization") == "Bearer fixture-only" else { return .init(401) }
      if request.header("range") == "bytes=2-5" {
        return .init(
          206, headers: ["Content-Range": "bytes 2-5/10", "Accept-Ranges": "bytes"],
          body: Data("2345".utf8))
      }
      return .init(200, headers: ["Accept-Ranges": "bytes"], body: Data("0123456789".utf8))
    }
    defer { origin.stop() }
    let relay = try MediaRelay(
      source: origin.url.appendingPathComponent("video.mp4"),
      headers: ["Authorization": "Bearer fixture-only"])
    let url = try await relay.start()
    defer { relay.stop() }
    var request = URLRequest(url: url)
    request.setValue("bytes=2-5", forHTTPHeaderField: "Range")
    let (data, response) = try await URLSession.shared.data(for: request)
    XCTAssertEqual(data, Data("2345".utf8))
    XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 206)
    XCTAssertEqual(
      (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Range"), "bytes 2-5/10")
    request.httpMethod = "HEAD"
    request.setValue(nil, forHTTPHeaderField: "Range")
    let (head, metadata) = try await URLSession.shared.data(for: request)
    XCTAssertTrue(head.isEmpty)
    XCTAssertEqual(metadata.expectedContentLength, 10)
    XCTAssertFalse(url.absoluteString.contains("fixture-only"))
  }
  func testHLSPlaylistKeyAndSegmentsRetainAuthentication() async throws {
    let origin = try await TestOrigin.start { request in
      guard request.header("authorization") == "Bearer fixture-only",
        request.header("x-provider") == "fixture"
      else { return .init(401) }
      if request.path.hasPrefix("/master.m3u8") {
        return .init(
          200, headers: ["Content-Type": "application/vnd.apple.mpegurl"],
          body: Data(
            "#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"keys/key.bin?version=1\"\n#EXTINF:4,\nsegments/one.ts?part=1\n#EXT-X-ENDLIST\n"
              .utf8))
      }
      return .init(200, body: Data(request.path.utf8))
    }
    defer { origin.stop() }
    let relay = try MediaRelay(
      source: origin.url.appendingPathComponent("master.m3u8"),
      headers: ["Authorization": "Bearer fixture-only", "X-Provider": "fixture"])
    let root = try await relay.start()
    defer { relay.stop() }
    let (data, _) = try await URLSession.shared.data(from: root)
    let playlist = String(decoding: data, as: UTF8.self)
    let key = try XCTUnwrap(
      playlist.components(separatedBy: "URI=\"").dropFirst().first?.components(separatedBy: "\"")
        .first)
    let segment = try XCTUnwrap(
      playlist.components(separatedBy: "\n").first(where: { $0.hasPrefix("http") }))
    for (address, path) in [(key, "/keys/key.bin?version=1"), (segment, "/segments/one.ts?part=1")]
    {
      let (body, response) = try await URLSession.shared.data(
        from: try XCTUnwrap(URL(string: address)))
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
      XCTAssertEqual(String(decoding: body, as: UTF8.self), path)
    }
  }
  func testForeignOriginAndRedirectNeverReceiveSourceCredentials() async throws {
    let foreign = try await TestOrigin.start { request in
      XCTAssertNil(request.header("authorization"))
      XCTAssertNil(request.header("cookie"))
      XCTAssertNil(request.header("x-provider"))
      return .init(200, body: Data("segment".utf8))
    }
    defer { foreign.stop() }
    let origin = try await TestOrigin.start { request in
      if request.path.hasPrefix("/redirect") {
        return .init(
          302, headers: ["Location": foreign.url.appendingPathComponent("stolen").absoluteString])
      }
      let playlist =
        "#EXTM3U\n#EXTINF:4,\n\(foreign.url.appendingPathComponent("segment.ts").absoluteString)\n#EXT-X-ENDLIST"
      return .init(
        200, headers: ["Content-Type": "application/vnd.apple.mpegurl"], body: Data(playlist.utf8))
    }
    defer { origin.stop() }
    let relay = try MediaRelay(
      source: origin.url.appendingPathComponent("master.m3u8"),
      headers: [
        "Authorization": "Bearer fixture-only", "Cookie": "fixture=1", "X-Provider": "fixture",
      ])
    let root = try await relay.start()
    defer { relay.stop() }
    let (data, _) = try await URLSession.shared.data(from: root)
    let address = try XCTUnwrap(
      String(decoding: data, as: UTF8.self).components(separatedBy: "\n").first(where: {
        $0.hasPrefix("http")
      }))
    let (_, response) = try await URLSession.shared.data(from: try XCTUnwrap(URL(string: address)))
    XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
    let redirect = try relay.localURL(for: origin.url.appendingPathComponent("redirect"))
    let (_, redirectResponse) = try await URLSession.shared.data(from: redirect)
    XCTAssertEqual((redirectResponse as? HTTPURLResponse)?.statusCode, 302)
    XCTAssertNil((redirectResponse as? HTTPURLResponse)?.value(forHTTPHeaderField: "Location"))
    XCTAssertEqual(foreign.requests.count, 1)
  }
  func testInvalidCapabilityDoesNotContactUpstreamAndStopRevokesRoutes() async throws {
    let origin = try await TestOrigin.start { _ in .init(200, body: Data("private".utf8)) }
    defer { origin.stop() }
    let relay = try MediaRelay(
      source: origin.url.appendingPathComponent("video.mp4"),
      headers: ["Authorization": "Bearer fixture-only"])
    let root = try await relay.start()
    var invalid = URLComponents(url: root, resolvingAgainstBaseURL: false)!
    invalid.path = "/invalid/capability/video.mp4"
    let (_, response) = try await URLSession.shared.data(from: invalid.url!)
    XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 404)
    XCTAssertTrue(origin.requests.isEmpty)
    relay.stop()
    XCTAssertThrowsError(try relay.localURL(for: origin.url))
  }
  func testHeaderInjectionAndTransportHeadersAreRejected() {
    for headers in [
      ["Authorization": "fixture\r\nInjected: value"], ["Host": "other.example"],
      ["Range": "bytes=0-1"], ["Bad:Name": "value"], ["Authorization\n": "fixture"],
      ["Authorization": "one", "authorization": "two"],
    ] {
      XCTAssertThrowsError(
        try MediaRelay(source: URL(string: "https://example.com/video")!, headers: headers))
    }
  }
  func testDASHBaseURLsTemplatesAndXMLSafety() throws {
    let xml =
      #"<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><BaseURL>media/</BaseURL><Period><AdaptationSet><Representation id="hd"><BaseURL>hd/</BaseURL><SegmentTemplate media="$RepresentationID$-$Number$.m4s?token=a&amp;b=2" initialization="init.mp4"/></Representation></AdaptationSet></Period></MPD>"#
    var targets: [String] = []
    let result = try ManifestRewriter.rewrite(
      Data(xml.utf8), kind: .dash, base: URL(string: "https://example.com/manifest.mpd")!
    ) { url in
      targets.append(url.absoluteString)
      return URL(string: "http://127.0.0.1:5000/private/" + String(targets.count))!
    }
    XCTAssertTrue(
      targets.contains("https://example.com/media/hd/$RepresentationID$-$Number$.m4s?token=a&b=2"))
    XCTAssertTrue(targets.contains("https://example.com/media/hd/init.mp4"))
    XCTAssertFalse(String(decoding: result, as: UTF8.self).contains("example.com"))
    XCTAssertThrowsError(
      try ManifestRewriter.rewrite(
        Data(
          "<!DOCTYPE MPD [<!ENTITY secret SYSTEM 'file:///etc/passwd'>]><MPD>&secret;</MPD>".utf8),
        kind: .dash, base: URL(string: "https://example.com/file.mpd")!
      ) { $0 })
  }
  func testDASHHTTPTemplatesRetainAuthentication() async throws {
    let origin = try await TestOrigin.start { request in
      guard request.header("authorization") == "Bearer fixture-only" else { return .init(401) }
      if request.path == "/manifest.mpd" {
        let xml =
          #"<MPD><BaseURL>media/</BaseURL><Period><AdaptationSet><Representation id="hd"><SegmentTemplate media="$RepresentationID$-$Number$.m4s" initialization="init.mp4"/></Representation></AdaptationSet></Period></MPD>"#
        return .init(200, headers: ["Content-Type": "application/dash+xml"], body: Data(xml.utf8))
      }
      return .init(200, body: Data(request.path.utf8))
    }
    defer { origin.stop() }
    let relay = try MediaRelay(
      source: origin.url.appendingPathComponent("manifest.mpd"),
      headers: ["Authorization": "Bearer fixture-only"])
    let url = try await relay.start()
    defer { relay.stop() }
    let (manifest, _) = try await URLSession.shared.data(from: url)
    let xml = String(decoding: manifest, as: UTF8.self)
    let address = try XCTUnwrap(
      xml.components(separatedBy: " media=\"").dropFirst().first?.components(separatedBy: "\"")
        .first
    )
    .replacingOccurrences(of: "$RepresentationID$", with: "hd").replacingOccurrences(
      of: "$Number$", with: "1")
    let (segment, response) = try await URLSession.shared.data(
      from: try XCTUnwrap(URL(string: address)))
    XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
    XCTAssertEqual(String(decoding: segment, as: UTF8.self), "/media/hd-1.m4s")
  }
  func testTrackIDsRemainDistinctAndLanguageSelectionDoesNotUseArrayOffsets() {
    let tracks = PlayerTrack.list(
      ids: [-1, 4, 19, 19, 33],
      names: ["Disabled", "English", "English commentary", "Duplicate", "Deutsch"])
    XCTAssertEqual(tracks.map(\.id), [4, 19, 33])
    XCTAssertEqual(tracks.first(where: { $0.matches(language: "de-DE") })?.id, 33)
    XCTAssertEqual(tracks.filter { $0.matches(language: "en") }.map(\.id), [4, 19])
    XCTAssertFalse(tracks[0].matches(language: ""))
  }
}

private final class TestOrigin: @unchecked Sendable {
  struct Request {
    let path: String
    let method: String
    let headers: [String: String]
    func header(_ name: String) -> String? { headers[name.lowercased()] }
  }
  struct Reply {
    let status: Int
    let headers: [String: String]
    let body: Data
    init(_ status: Int, headers: [String: String] = [:], body: Data = Data()) {
      self.status = status
      self.headers = headers
      self.body = body
    }
  }
  private let lock = NSLock()
  private let queue = DispatchQueue(label: "cinefern.tests.origin")
  private var seen: [Request] = []
  private var connections: [NWConnection] = []
  private let listener: NWListener
  private let handler: (Request) -> Reply
  var requests: [Request] { lock.withLock { seen } }
  var url: URL { URL(string: "http://127.0.0.1:\(listener.port!.rawValue)")! }
  private init(handler: @escaping (Request) -> Reply) throws {
    self.handler = handler
    let parameters = NWParameters.tcp
    parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
    listener = try NWListener(using: parameters)
  }
  static func start(_ handler: @escaping (Request) -> Reply) async throws -> TestOrigin {
    let server = try TestOrigin(handler: handler)
    return try await withCheckedThrowingContinuation { continuation in
      var finished = false
      server.listener.stateUpdateHandler = { state in
        guard !finished else { return }
        if case .ready = state {
          finished = true
          continuation.resume(returning: server)
        }
        if case .failed(let error) = state {
          finished = true
          continuation.resume(throwing: error)
        }
      }
      server.listener.newConnectionHandler = { client in
        server.lock.withLock { server.connections.append(client) }
        client.start(queue: server.queue)
        server.receive(client, data: Data())
      }
      server.listener.start(queue: server.queue)
    }
  }
  private func receive(_ client: NWConnection, data: Data) {
    client.receive(minimumIncompleteLength: 1, maximumLength: 16384) { chunk, _, done, error in
      var data = data
      data.append(chunk ?? Data())
      guard error == nil, data.count < 65536 else {
        client.cancel()
        return
      }
      guard let end = data.range(of: Data("\r\n\r\n".utf8)) else {
        if !done { self.receive(client, data: data) }
        return
      }
      let lines = String(decoding: data[..<end.lowerBound], as: UTF8.self).components(
        separatedBy: "\r\n")
      let first = lines[0].split(separator: " ")
      var headers: [String: String] = [:]
      for line in lines.dropFirst() {
        if let colon = line.firstIndex(of: ":") {
          headers[String(line[..<colon]).lowercased()] = String(line[line.index(after: colon)...])
            .trimmingCharacters(in: .whitespaces)
        }
      }
      let request = Request(path: String(first[1]), method: String(first[0]), headers: headers)
      self.lock.withLock { self.seen.append(request) }
      let response = self.handler(request)
      var head =
        "HTTP/1.1 \(response.status) Fixture\r\nContent-Length: \(response.body.count)\r\nConnection: close\r\n"
      for (key, value) in response.headers { head += "\(key): \(value)\r\n" }
      var bytes = Data((head + "\r\n").utf8)
      if request.method != "HEAD" { bytes.append(response.body) }
      client.send(content: bytes, completion: .contentProcessed { _ in client.cancel() })
    }
  }
  func stop() {
    listener.cancel()
    lock.withLock {
      connections.forEach { $0.cancel() }
      connections = []
    }
  }
}
