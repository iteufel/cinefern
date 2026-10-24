import AVKit
import SwiftUI

#if canImport(MobileVLCKit)
  import MobileVLCKit
#elseif canImport(TVVLCKit)
  import TVVLCKit
#elseif canImport(VLCKit)
  import VLCKit
#endif

struct PlayerScreen: View {
  @EnvironmentObject var model: AppModel
  @Environment(\.dismiss) private var dismiss
  @ObservedObject var session: PlaybackSession
  @State private var menu = false
  var body: some View {
    NavigationStack {
      Group {
        #if os(iOS)
          if #available(iOS 27.1, *) {
            GeometryReader { proxy in
              if !proxy.reservedRegions(kind: .division).isEmpty {
                ArrangementView {
                  video
                } secondary: {
                  controls
                }.arrangementViewStyle(.split)
              } else {
                video
              }
            }
          } else {
            video
          }
        #else
          video
        #endif
      }.background(.black).navigationTitle(session.item["title"].string)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button {
              session.stop()
              dismiss()
            } label: {
              Label(model.text("Close", "Schließen"), systemImage: "xmark")
            }
          }
          ToolbarItem(placement: .primaryAction) {
            Button {
              menu = true
            } label: {
              Label(
                model.text("Playback options", "Wiedergabeoptionen"),
                systemImage: "slider.horizontal.3")
            }.accessibilityIdentifier("player.options")
          }
        }
        .sheet(isPresented: $menu) {
          NavigationStack {
            controls.navigationTitle(model.text("Playback options", "Wiedergabeoptionen")).toolbar {
              ToolbarItem(placement: .confirmationAction) {
                Button(model.text("Done", "Fertig")) { menu = false }
              }
            }
          }
        }
        .onDisappear { session.stop() }
        #if os(tvOS)
          .onPlayPauseCommand { session.setPlaying(!session.isPlaying) }
          .onExitCommand {
            session.stop()
            dismiss()
          }
        #endif
    }
  }
  var video: some View {
    ZStack(alignment: .bottom) {
      if session.engine == .avkit {
        AppleVideoSurface(player: session.apple)
      } else {
        VLCVideoSurface(session: session)
      }
      if !session.caption.isEmpty {
        Text(session.caption).font(.title3.bold()).multilineTextAlignment(.center).padding(10)
          .background(.black.opacity(0.75)).padding(.bottom, 70).allowsHitTesting(false)
      }
      if let failure = session.failure { Text(failure).padding().background(.regularMaterial) }
      if session.engine == .vlc {
        HStack {
          Button {
            session.seek(session.position - 15)
          } label: {
            Label("−15", systemImage: "gobackward.15")
          }
          Button {
            session.setPlaying(!session.isPlaying)
          } label: {
            Label(
              model.text("Play / pause", "Wiedergabe / Pause"),
              systemImage: session.isPlaying ? "pause.fill" : "play.fill")
          }
          Button {
            session.seek(session.position + 15)
          } label: {
            Label("+15", systemImage: "goforward.15")
          }
          Button {
            menu = true
          } label: {
            Label(model.text("Options", "Optionen"), systemImage: "slider.horizontal.3")
          }
        }.padding().modifier(PlayerGlass()).padding()
      }
    }.frame(maxWidth: .infinity, maxHeight: .infinity)
  }
  var controls: some View {
    Form {
      Section(model.text("Playback", "Wiedergabe")) {
        Text(session.item["title"].string).font(.headline)
        Button {
          session.setPlaying(!session.isPlaying)
        } label: {
          Label(
            model.text("Play / pause", "Wiedergabe / Pause"),
            systemImage: session.isPlaying ? "pause" : "play")
        }
        HStack {
          Button("−15 s") { session.seek(session.position - 15) }
          Spacer()
          Button("+15 s") { session.seek(session.position + 15) }
        }
        Text("\(Int(session.position)) / \(Int(session.duration)) s").monospacedDigit()
        #if !os(tvOS)
          Slider(
            value: Binding(get: { session.position }, set: { session.seek($0) }),
            in: 0...max(1, session.duration)
          ).accessibilityLabel(model.text("Position", "Position"))
          Slider(value: $session.volume, in: 0...1).accessibilityLabel(
            model.text("Volume", "Lautstärke"))
        #endif
        Picker(model.text("Speed", "Geschwindigkeit"), selection: $session.speed) {
          ForEach([Float(0.5), 1, 1.25, 1.5, 2], id: \.self) { speed in
            Text("\(speed.formatted())×").tag(speed)
          }
        }
        Button(model.text("Previous episode", "Vorherige Folge")) {
          Task { await model.advance(session, offset: -1) }
        }
        Button(model.text("Next episode", "Nächste Folge")) {
          Task { await model.advance(session, offset: 1) }
        }
      }
      Section(model.text("Source", "Quelle")) {
        ForEach(Array(session.sources.enumerated()), id: \.offset) { _, source in
          Button {
            model.changeSource(source, session: session)
          } label: {
            Label(
              source["label"].string,
              systemImage: source["id"] == session.source["id"] ? "checkmark.circle.fill" : "circle"
            )
          }
        }
      }
      if !session.source["audioTracks"].array.isEmpty {
        Section(model.text("Audio", "Ton")) {
          ForEach(Array(session.source["audioTracks"].array.enumerated()), id: \.offset) {
            _, track in
            Button(track["label"].string) {
              Task { await model.changeAudio(track["id"].string, session: session) }
            }
          }
        }
      }
      Section(model.text("Subtitles", "Untertitel")) {
        Button(model.text("Off", "Aus")) {
          session.subtitleCues = []
          session.selectedSubtitle = ""
        }
        ForEach(Array(session.source["subtitles"].array.enumerated()), id: \.offset) {
          _, subtitle in
          Button(subtitle["label"].string) {
            Task {
              do {
                let result = try await model.call("subtitles", subtitle)
                session.subtitleCues = result.array
                session.selectedSubtitle = subtitle["id"].string
              } catch { model.error = error.localizedDescription }
            }
          }
        }
        Text(
          model.text(
            "Embedded tracks and AirPlay are available in the AVKit system controls.",
            "Eingebettete Spuren und AirPlay findest du in den AVKit-Systemsteuerelementen.")
        ).font(.caption).foregroundStyle(.secondary)
      }
    }
  }
}
struct PlayerGlass: ViewModifier {
  @ViewBuilder func body(content: Content) -> some View {
    if #available(iOS 26, macOS 26, tvOS 26, *) {
      content.glassEffect(in: .capsule)
    } else {
      content.background(.regularMaterial, in: Capsule())
    }
  }
}
#if os(macOS)
  struct AppleVideoSurface: NSViewRepresentable {
    let player: AVPlayer
    func makeNSView(context: Context) -> AVPlayerView {
      let view = AVPlayerView()
      view.player = player
      view.controlsStyle = .floating
      view.showsFullScreenToggleButton = true
      view.allowsPictureInPicturePlayback = true
      return view
    }
    func updateNSView(_ view: AVPlayerView, context: Context) {
      if view.player !== player { view.player = player }
    }
  }
  struct VLCVideoSurface: NSViewRepresentable {
    let session: PlaybackSession
    func makeNSView(context: Context) -> NSView {
      let view = NSView()
      attach(view)
      return view
    }
    func updateNSView(_ view: NSView, context: Context) { attach(view) }
    func attach(_ view: NSView) {
      #if canImport(VLCKit)
        session.vlc?.drawable = view
      #endif
    }
  }
#else
  struct AppleVideoSurface: UIViewControllerRepresentable {
    let player: AVPlayer
    func makeUIViewController(context: Context) -> AVPlayerViewController {
      let view = AVPlayerViewController()
      view.player = player
      view.allowsPictureInPicturePlayback = true
      return view
    }
    func updateUIViewController(_ view: AVPlayerViewController, context: Context) {
      if view.player !== player { view.player = player }
    }
  }
  struct VLCVideoSurface: UIViewRepresentable {
    let session: PlaybackSession
    func makeUIView(context: Context) -> UIView {
      let view = UIView()
      view.backgroundColor = .black
      attach(view)
      return view
    }
    func updateUIView(_ view: UIView, context: Context) { attach(view) }
    func attach(_ view: UIView) {
      #if canImport(MobileVLCKit) || canImport(TVVLCKit)
        session.vlc?.drawable = view
      #endif
    }
  }
#endif
