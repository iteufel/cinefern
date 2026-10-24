import Foundation

public enum ManifestRewriter {
  public enum Kind { case hls, dash }
  public static func kind(url: URL, mime: String) -> Kind? {
    if url.pathExtension.lowercased() == "m3u8"
      || ["application/vnd.apple.mpegurl", "application/x-mpegurl", "audio/mpegurl"].contains(
        mime.lowercased())
    {
      return .hls
    }
    if url.pathExtension.lowercased() == "mpd" || mime.lowercased() == "application/dash+xml" {
      return .dash
    }
    return nil
  }
  public static func rewrite(_ data: Data, kind: Kind, base: URL, route: (URL) throws -> URL) throws
    -> Data
  {
    guard let text = String(data: data, encoding: .utf8) else {
      throw NativeFailure("Invalid media manifest encoding.")
    }
    func routed(_ value: String, base: URL) throws -> String {
      guard let url = URL(string: value, relativeTo: base)?.absoluteURL, MediaRelay.valid(url)
      else { throw NativeFailure("Unsupported manifest resource.") }
      return try route(url).absoluteString
    }
    switch kind {
    case .hls:
      guard text.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("#EXTM3U") else {
        throw NativeFailure("Invalid HLS manifest.")
      }
      let pattern = try NSRegularExpression(pattern: "URI=\"([^\"]*)\"")
      let lines = try text.components(separatedBy: .newlines).map { line -> String in
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return line }
        if !trimmed.hasPrefix("#") { return try routed(trimmed, base: base) }
        var result = line
        for match in pattern.matches(in: line, range: NSRange(line.startIndex..., in: line))
          .reversed()
        {
          guard let capture = Range(match.range(at: 1), in: line),
            let target = Range(match.range(at: 1), in: result)
          else { continue }
          result.replaceSubrange(target, with: try routed(String(line[capture]), base: base))
        }
        return result
      }
      return Data(lines.joined(separator: "\n").utf8)
    case .dash:
      guard !text.uppercased().contains("<!DOCTYPE"), !text.uppercased().contains("<!ENTITY") else {
        throw NativeFailure("Unsupported DASH entities.")
      }
      let reader = XMLTree()
      let parser = XMLParser(data: data)
      parser.shouldResolveExternalEntities = false
      parser.delegate = reader
      guard parser.parse(), let root = reader.root, root.localName == "MPD" else {
        throw NativeFailure("Invalid DASH manifest.")
      }
      func rewrite(_ node: XMLNode, base parent: URL) throws {
        let bases = node.children.compactMap { $0.node }.filter { $0.localName == "BaseURL" }
        var effective = parent
        if let first = bases.first,
          let url = URL(string: first.text, relativeTo: parent)?.absoluteURL
        {
          effective = url
        }
        for element in bases { element.children = [.text(try routed(element.text, base: parent))] }
        let resourceKeys: [String]
        switch node.localName {
        case "SegmentTemplate": resourceKeys = ["media", "initialization"]
        case "SegmentURL": resourceKeys = ["media", "index"]
        case "Initialization", "RepresentationIndex": resourceKeys = ["sourceURL"]
        default: resourceKeys = ["xlink:href"]
        }
        for key in resourceKeys {
          if let value = node.attributes[key] {
            node.attributes[key] = try routed(value, base: effective)
          }
        }
        for child in node.children.compactMap({ $0.node }) where child.localName != "BaseURL" {
          try rewrite(child, base: effective)
        }
      }
      try rewrite(root, base: base)
      return Data(("<?xml version=\"1.0\" encoding=\"UTF-8\"?>" + root.serialized()).utf8)
    }
  }
}
private final class XMLNode {
  enum Child {
    case text(String)
    case element(XMLNode)
    var node: XMLNode? {
      if case .element(let n) = self { return n }
      return nil
    }
  }
  let name: String
  var localName: String { name.split(separator: ":").last.map(String.init) ?? name }
  var attributes: [String: String]
  var children: [Child] = []
  var text: String {
    children.compactMap {
      if case .text(let s) = $0 { return s }
      return nil
    }.joined().trimmingCharacters(in: .whitespacesAndNewlines)
  }
  init(_ name: String, _ attributes: [String: String]) {
    self.name = name
    self.attributes = attributes
  }
  private func escape(_ text: String) -> String {
    text.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
      .replacingOccurrences(of: "\"", with: "&quot;")
  }
  func serialized() -> String {
    let attrs = attributes.keys.sorted().map { " \($0)=\"\(escape(attributes[$0]!))\"" }.joined()
    let body = children.map { child in
      switch child {
      case .text(let value): return escape(value)
      case .element(let node): return node.serialized()
      }
    }.joined()
    return "<\(name)\(attrs)>\(body)</\(name)>"
  }
}
private final class XMLTree: NSObject, XMLParserDelegate {
  var root: XMLNode?
  var stack: [XMLNode] = []
  func parser(
    _ parser: XMLParser, didStartElement name: String, namespaceURI: String?,
    qualifiedName: String?, attributes: [String: String]
  ) {
    let node = XMLNode(name, attributes)
    if let parent = stack.last { parent.children.append(.element(node)) } else { root = node }
    stack.append(node)
  }
  func parser(_ parser: XMLParser, foundCDATA data: Data) {
    if let text = String(data: data, encoding: .utf8) { stack.last?.children.append(.text(text)) }
  }
  func parser(_ parser: XMLParser, foundCharacters string: String) {
    stack.last?.children.append(.text(string))
  }
  func parser(
    _ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?
  ) { _ = stack.popLast() }
}
