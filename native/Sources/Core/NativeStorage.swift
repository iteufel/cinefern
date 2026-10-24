import CryptoKit
import Foundation
import Security

public protocol NativeStorage: AnyObject {
  func get(_ key: String) throws -> String?
  func set(_ key: String, value: String) throws
  func remove(_ key: String) throws
  func keys() throws -> [String]
}
/// Queue-confined. The entire native namespace (including plugin settings) is encrypted at rest.
/// A separate namespace prevents modifying the existing React Native library before cutover.
public final class EncryptedStorage: NativeStorage {
  private let directory: URL
  private let key: SymmetricKey
  private var values: [String: String]
  public init(directory: URL? = nil, service: String = "org.cinefern.native.storage.v1") throws {
    self.directory =
      try directory
      ?? FileManager.default.url(
        for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
      ).appendingPathComponent("CinefernNative", isDirectory: true)
    try FileManager.default.createDirectory(at: self.directory, withIntermediateDirectories: true)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
      kSecAttrAccount as String: "encryption-key",
    ]
    var result: CFTypeRef?
    let status = SecItemCopyMatching(
      query.merging([kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]) {
        _, new in new
      } as CFDictionary, &result)
    let data: Data
    if status == errSecSuccess, let stored = result as? Data {
      data = stored
    } else if status == errSecItemNotFound {
      data = SymmetricKey(size: .bits256).withUnsafeBytes { Data($0) }
      let add = query.merging([
        kSecValueData as String: data,
        kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
      ]) { _, new in new }
      guard SecItemAdd(add as CFDictionary, nil) == errSecSuccess else {
        throw NativeFailure("Could not create secure storage key.")
      }
    } else {
      throw NativeFailure("Secure storage is unavailable (\(status)).")
    }
    key = SymmetricKey(data: data)
    let file = self.directory.appendingPathComponent("library.encrypted")
    if FileManager.default.fileExists(atPath: file.path) {
      let sealed = try AES.GCM.SealedBox(combined: Data(contentsOf: file))
      values = try JSONDecoder().decode(
        [String: String].self, from: AES.GCM.open(sealed, using: key))
    } else {
      values = [:]
    }
  }
  private func persist(_ next: [String: String]) throws {
    let data = try AES.GCM.seal(JSONEncoder().encode(next), using: key).combined!
    try data.write(to: directory.appendingPathComponent("library.encrypted"), options: .atomic)
    values = next
  }
  public func get(_ key: String) throws -> String? { values[key] }
  public func set(_ key: String, value: String) throws {
    var next = values
    next[key] = value
    try persist(next)
  }
  public func remove(_ key: String) throws {
    var next = values
    next.removeValue(forKey: key)
    try persist(next)
  }
  public func keys() throws -> [String] { Array(values.keys) }
}
public final class MemoryStorage: NativeStorage {
  private var values: [String: String] = [:]
  public init() {}
  public func get(_ key: String) throws -> String? { values[key] }
  public func set(_ key: String, value: String) throws { values[key] = value }
  public func remove(_ key: String) throws { values.removeValue(forKey: key) }
  public func keys() throws -> [String] { Array(values.keys) }
}
