import Foundation

public enum JSONValue: Codable, Equatable, Sendable {
  case null
  case bool(Bool)
  case number(Double)
  case string(String)
  case array([JSONValue])
  case object([String: JSONValue])
  public init(from decoder: Decoder) throws {
    let c = try decoder.singleValueContainer()
    if c.decodeNil() {
      self = .null
    } else if let v = try? c.decode(Bool.self) {
      self = .bool(v)
    } else if let v = try? c.decode(Double.self) {
      self = .number(v)
    } else if let v = try? c.decode(String.self) {
      self = .string(v)
    } else if let v = try? c.decode([JSONValue].self) {
      self = .array(v)
    } else {
      self = .object(try c.decode([String: JSONValue].self))
    }
  }
  public func encode(to encoder: Encoder) throws {
    var c = encoder.singleValueContainer()
    switch self {
    case .null: try c.encodeNil()
    case .bool(let v): try c.encode(v)
    case .number(let v): try c.encode(v)
    case .string(let v): try c.encode(v)
    case .array(let v): try c.encode(v)
    case .object(let v): try c.encode(v)
    }
  }
  public subscript(_ key: String) -> JSONValue {
    get { object[key] ?? .null }
    set {
      var o = object
      o[key] = newValue
      self = .object(o)
    }
  }
  public var object: [String: JSONValue] {
    if case .object(let v) = self { return v }
    return [:]
  }
  public var array: [JSONValue] {
    if case .array(let v) = self { return v }
    return []
  }
  public var string: String {
    if case .string(let v) = self { return v }
    return ""
  }
  public var double: Double {
    if case .number(let v) = self { return v }
    return 0
  }
  public var bool: Bool {
    if case .bool(let v) = self { return v }
    return false
  }
  public func encoded() throws -> String {
    String(decoding: try JSONEncoder().encode(self), as: UTF8.self)
  }
  public static func parse(_ string: String) throws -> JSONValue {
    try JSONDecoder().decode(Self.self, from: Data(string.utf8))
  }
  public var mediaKey: String {
    (try? JSONValue.array([self["providerId"], self["id"]]).encoded()) ?? ""
  }
}
public struct NativeFailure: LocalizedError, Sendable {
  public let message: String
  public init(_ message: String) { self.message = message }
  public var errorDescription: String? { message }
}
