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
  @Published private(set) var playbackRequested = true
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
  @Published var embeddedAudioTracks: [PlayerTrack] = []
  @Published var embeddedSubtitleTracks: [PlayerTrack] = []
  @Published var selectedAudioTrack: Int32 = -1
  @Published var selectedEmbeddedSubtitle: Int32 = -1
  private let preferences: JSONValue
  private var audioPreferenceApplied = false
  private var subtitlePreferenceApplied = false
  private var relay: MediaRelay?
  private var loadRevision = UUID()
  private var timer: Timer?
  private var observer: Any?
  private var lastRecord: Double = 0
  private var stopped = false
  private var didEnd = false
  #if canImport(MobileVLCKit) || canImport(TVVLCKit) || canImport(VLCKit)
    let vlc: VLCMediaPlayer? = VLCMediaPlayer()
  #endif
  init(
    item: JSONValue, selection: JSONValue, queue: [JSONValue], engine: PlayerEngine, trailer: Bool,
    preferences: JSONValue
  ) async throws {
    self.preferences = preferences
    self.item = item
    self.queue = queue
    self.engine = engine
    self.trailer = trailer
    self.sources = selection["sources"].array
    #if !os(macOS)
      try await Task.detached(priority: .userInitiated) {
        let audio = AVAudioSession.sharedInstance()
        try audio.setCategory(.playback, mode: .moviePlayback)
        try audio.setActive(true)
      }.value
    #endif
    try await load(selection["source"], at: selection["startAt"].double)
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
  func load(_ source: JSONValue, at seconds: Double, playing: Bool = true) async throws {
    guard !stopped else { throw CancellationError() }
    guard let remote = URL(string: source["url"].string),
      ["http", "https", "file"].contains(remote.scheme ?? "")
    else { throw NativeFailure("Invalid media URL.") }
    guard engine != .avkit || source["type"].string != "dash" else {
      throw NativeFailure("Choose VLC for DASH media.")
    }
    let revision = UUID()
    loadRevision = revision
    let headerValues = source["headers"].object
    guard
      headerValues.values.allSatisfy({
        if case .string = $0 { return true }
        return false
      })
    else { throw NativeFailure("Invalid media headers.") }
    let candidate =
      headerValues.isEmpty
      ? nil : try MediaRelay(source: remote, headers: headerValues.mapValues(\.string))
    let url: URL
    do { url = try await candidate?.start() ?? remote } catch {
      candidate?.stop()
      throw error
    }
    guard !stopped, loadRevision == revision else {
      candidate?.stop()
      throw CancellationError()
    }
    let previous = relay
    relay = candidate
    self.source = source
    position = seconds
    failure = nil
    didEnd = false
    subtitleCues = []
    selectedSubtitle = ""
    embeddedAudioTracks = []
    embeddedSubtitleTracks = []
    audioPreferenceApplied = false
    subtitlePreferenceApplied = false
    if engine == .avkit {
      apple.allowsExternalPlayback = candidate == nil
      let playerItem = AVPlayerItem(url: url)
      apple.replaceCurrentItem(with: playerItem)
      apple.seek(to: CMTime(seconds: seconds, preferredTimescale: 600), completionHandler: { _ in })
      apple.volume = volume
    } else {
      #if canImport(MobileVLCKit) || canImport(TVVLCKit) || canImport(VLCKit)
        vlc?.stop()
        let media = VLCMedia(url: url)
        media.addOptions(["start-time": String(seconds)])
        vlc?.media = media
      #else
        candidate?.stop()
        throw NativeFailure("VLC is unavailable in this build.")
      #endif
    }
    previous?.stop()
    setPlaying(playing)
  }
  func selectAudioTrack(_ id: Int32) {
    guard embeddedAudioTracks.contains(where: { $0.id == id }) else { return }
    audioPreferenceApplied = true
    #if canImport(MobileVLCKit) || canImport(TVVLCKit) || canImport(VLCKit)
      vlc?.currentAudioTrackIndex = id
    #endif
    selectedAudioTrack = id
  }
  func selectEmbeddedSubtitle(_ id: Int32) {
    guard id == -1 || embeddedSubtitleTracks.contains(where: { $0.id == id }) else { return }
    subtitlePreferenceApplied = true
    #if canImport(MobileVLCKit) || canImport(TVVLCKit) || canImport(VLCKit)
      vlc?.currentVideoSubTitleIndex = id
    #endif
    selectedEmbeddedSubtitle = id
    subtitleCues = []
    selectedSubtitle = ""
  }
  private func updateEmbeddedTracks() {
    #if canImport(MobileVLCKit) || canImport(TVVLCKit) || canImport(VLCKit)
      guard let vlc else { return }
      embeddedAudioTracks = PlayerTrack.list(
        ids: (vlc.audioTrackIndexes as? [NSNumber] ?? []).map(\.int32Value),
        names: vlc.audioTrackNames as? [String] ?? [])
      embeddedSubtitleTracks = PlayerTrack.list(
        ids: (vlc.videoSubTitlesIndexes as? [NSNumber] ?? []).map(\.int32Value),
        names: vlc.videoSubTitlesNames as? [String] ?? [])
      if !audioPreferenceApplied,
        let preferred = embeddedAudioTracks.first(where: {
          $0.matches(language: preferences["audioLanguage"].string)
        })
      {
        selectAudioTrack(preferred.id)
      }
      if !subtitlePreferenceApplied {
        let language = preferences["subtitleLanguage"].string
        if language.isEmpty {
          selectEmbeddedSubtitle(-1)
        } else if let preferred = embeddedSubtitleTracks.first(where: {
          $0.matches(language: language)
        }) {
          selectEmbeddedSubtitle(preferred.id)
        }
      }
      selectedAudioTrack = vlc.currentAudioTrackIndex
      selectedEmbeddedSubtitle = vlc.currentVideoSubTitleIndex
    #endif
  }
  func setPlaying(_ playing: Bool) {
    playbackRequested = playing
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
      if isPlaying {
        playbackRequested = true
      } else if apple.timeControlStatus == .paused, apple.currentItem?.status == .readyToPlay {
        playbackRequested = false
      }
      if apple.currentItem?.status == .failed {
        failure = "Playback failed. Try another source or VLC."
      }
    }
    #if canImport(MobileVLCKit) || canImport(TVVLCKit) || canImport(VLCKit)
      if engine == .vlc {
        updateEmbeddedTracks()
        position = Double(vlc?.time.intValue ?? 0) / 1000
        duration = Double(vlc?.media?.length.intValue ?? 0) / 1000
        isPlaying = vlc?.isPlaying ?? false
        if !playbackRequested && isPlaying { vlc?.pause() }
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
    loadRevision = UUID()
    relay?.stop()
    relay = nil
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
    relay?.stop()
    timer?.invalidate()
    if let observer { NotificationCenter.default.removeObserver(observer) }
  }
}
