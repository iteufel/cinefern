import Foundation

public struct PlayerTrack: Identifiable, Equatable, Sendable {
  public let id: Int32
  public let label: String
  public static func list(ids: [Int32], names: [String]) -> [PlayerTrack] {
    var seen = Set<Int32>()
    return ids.enumerated().compactMap { index, id in
      guard id >= 0, seen.insert(id).inserted else { return nil }
      let name =
        names.indices.contains(index)
        ? names[index].trimmingCharacters(in: .whitespacesAndNewlines) : ""
      return PlayerTrack(id: id, label: name.isEmpty ? "Track \(id)" : name)
    }
  }
  public func matches(language: String) -> Bool {
    guard !language.isEmpty else { return false }
    let code = language.lowercased().split(separator: "-").first.map(String.init) ?? language
    let aliases: [String: [String]] = [
      "en": ["en", "eng", "english"], "de": ["de", "deu", "ger", "german", "deutsch"],
      "fr": ["fr", "fra", "fre", "french", "français"], "es": ["es", "spa", "spanish", "español"],
    ]
    let words = label.lowercased().components(separatedBy: CharacterSet.alphanumerics.inverted)
    return (aliases[code] ?? [code]).contains(where: words.contains)
  }
}
