import AVKit
import Combine
import SwiftUI

#if canImport(MobileVLCKit)
  import MobileVLCKit
#elseif canImport(TVVLCKit)
  import TVVLCKit
#elseif canImport(VLCKit)
  import VLCKit
#endif

enum PlayerEngine: String, CaseIterable {
  case avkit, vlc
  static var saved: Self {
    Self(rawValue: UserDefaults.standard.string(forKey: "cinefern.native.player") ?? "") ?? .avkit
  }
  static var vlcAvailable: Bool {
    #if canImport(MobileVLCKit) || canImport(TVVLCKit) || canImport(VLCKit)
      true
    #else
      false
    #endif
  }
}
@MainActor final class PlaybackSession: ObservableObject, Identifiable {
  let id = UUID()
  let item: JSONValue
  let queue: [JSONValue]
  let engine: PlayerEngine
  let trailer: Bool
  let apple = AVPlayer()
  @Published var sources: [JSONValue]
  @Published var source: JSONValue = .null
  @Published var position: Double = 0
  @Published var duration: Double = 0
  @Published var isPlaying = false
  @Published var failure: String?
  @Published var subtitleCues: [JSONValue] = []
  @Published var selectedSubtitle = ""
  @Published var speed: Float = 1 { didSet { if isPlaying { setPlaying(true) } } }
  @Published var volume: Float = 0.85 {
    didSet {
      apple.volume = volume
      #if canImport(MobileVLCKit) || canImport(TVVLCKit) || canImport(VLCKit)
        vlc?.audio?.volume = Int32(volume * 100)
      #endif
    }
  }
  var onProgress: ((Double, Double) -> Void)?
  var onEnded: (() -> Void)?
  private var timer: Timer?
  private var observer: Any?
  private var lastRecord: Double = 0
  private var stopped = false
  private var didEnd = false
  #if canImport(MobileVLCKit) || canImport(TVVLCKit) || canImport(VLCKit)
    let vlc: VLCMediaPlayer? = VLCMediaPlayer()
  #endif
  init(
    item: JSONValue, selection: JSONValue, queue: [JSONValue], engine: PlayerEngine, trailer: Bool
  ) throws {
    self.item = item
    self.queue = queue
    self.engine = engine
    self.trailer = trailer
    self.sources = selection["sources"].array
    #if !os(macOS)
      try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
      try AVAudioSession.sharedInstance().setActive(true)
    #endif
    try load(selection["source"], at: selection["startAt"].double)
    observer = NotificationCenter.default.addObserver(
      forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main
    ) { [weak self] notification in
      Task { @MainActor in
        guard let self, notification.object as? AVPlayerItem === self.apple.currentItem else {
          return
        }
        self.finish()
      }
    }
    timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
      Task { @MainActor in self?.tick() }
    }
  }
  func load(_ source: JSONValue, at seconds: Double, playing: Bool = true) throws {
    guard let url = URL(string: source["url"].string),
      ["http", "https", "file"].contains(url.scheme ?? "")
    else { throw NativeFailure("Invalid media URL.") }
    self.source = source
    position = seconds
    failure = nil
    didEnd = false
    stopped = false
    subtitleCues = []
    selectedSubtitle = ""
    if engine == .avkit {
      guard source["type"].string != "dash",
        source["headers"] == .null || source["headers"].object.isEmpty
      else { throw NativeFailure("Choose VLC for DASH or sources with HTTP headers.") }
      let playerItem = AVPlayerItem(url: url)
      apple.replaceCurrentItem(with: playerItem)
      apple.seek(to: CMTime(seconds: seconds, preferredTimescale: 600))
      apple.volume = volume
    } else {
      #if canImport(MobileVLCKit) || canImport(TVVLCKit) || canImport(VLCKit)
        vlc?.stop()
        let media = VLCMedia(url: url)
        media.addOptions(["start-time": String(seconds)])
        // VLC 3 exposes these two header options. Reject other headers instead of dropping them.
        for (header, value) in source["headers"].object {
          guard !header.contains(":"), !header.contains("\n"), !value.string.contains("\n"),
            !value.string.contains("\r")
          else { throw NativeFailure("Invalid source header.") }
          switch header.lowercased() {
          case "user-agent": media.addOption(":http-user-agent=\(value.string)")
          case "referer": media.addOption(":http-referrer=\(value.string)")
          default:
            throw NativeFailure(
              "This VLC build cannot send this HTTP header. Choose another source.")
          }
        }
        vlc?.media = media
      #else
        throw NativeFailure("VLC is unavailable in this build.")
      #endif
    }
    setPlaying(playing)
  }
  func setPlaying(_ playing: Bool) {
    isPlaying = playing
    if engine == .avkit {
      if playing { apple.playImmediately(atRate: speed) } else { apple.pause() }
    }
    #if canImport(MobileVLCKit) || canImport(TVVLCKit) || canImport(VLCKit)
      if engine == .vlc {
        if playing {
          vlc?.play()
          vlc?.rate = speed
        } else {
          vlc?.pause()
        }
      }
    #endif
  }
  func seek(_ seconds: Double) {
    let target = max(0, min(duration > 0 ? duration : Double.greatestFiniteMagnitude, seconds))
    if engine == .avkit { apple.seek(to: CMTime(seconds: target, preferredTimescale: 600)) }
    #if canImport(MobileVLCKit) || canImport(TVVLCKit) || canImport(VLCKit)
      if engine == .vlc { vlc?.time = VLCTime(int: Int32(min(target * 1000, Double(Int32.max)))) }
    #endif
    position = target
  }
  func tick() {
    guard !stopped else { return }
    if engine == .avkit {
      let time = apple.currentTime().seconds
      if time.isFinite { position = time }
      let length = apple.currentItem?.duration.seconds ?? 0
      if length.isFinite { duration = length }
      isPlaying = apple.timeControlStatus == .playing
      if apple.currentItem?.status == .failed {
        failure = "Playback failed. Try another source or VLC."
      }
    }
    #if canImport(MobileVLCKit) || canImport(TVVLCKit) || canImport(VLCKit)
      if engine == .vlc {
        position = Double(vlc?.time.intValue ?? 0) / 1000
        duration = Double(vlc?.media?.length.intValue ?? 0) / 1000
        isPlaying = vlc?.isPlaying ?? false
        if vlc?.state == .ended { finish() }
        if vlc?.state == .error { failure = "VLC could not play this source." }
      }
    #endif
    if duration > 0, abs(position - lastRecord) >= 5 {
      lastRecord = position
      onProgress?(position, duration)
    }
  }
  func finish() {
    guard !didEnd else { return }
    didEnd = true
    onProgress?(position, duration)
    onEnded?()
  }
  func stop() {
    guard !stopped else { return }
    stopped = true
    onProgress?(position, duration)
    apple.pause()
    #if canImport(MobileVLCKit) || canImport(TVVLCKit) || canImport(VLCKit)
      vlc?.stop()
    #endif
    timer?.invalidate()
    timer = nil
    if let observer {
      NotificationCenter.default.removeObserver(observer)
      self.observer = nil
    }
  }
  var caption: String {
    subtitleCues.filter { position >= $0["start"].double && position < $0["end"].double }.map {
      $0["text"].string
    }.joined(separator: "\n")
  }
  deinit {
    timer?.invalidate()
    if let observer { NotificationCenter.default.removeObserver(observer) }
  }
}
