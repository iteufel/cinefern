# iPhone Duo: public APIs and validation boundary

Research date: **24 October 2026**. Implementation compiled with Xcode 27.1,
Swift 6.4. No prior cloud-prototype completion claim is used.

## Sources checked

- Apple [Designing for iPhone Duo](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo):
  display continuity, size classes, reserved regions, split/overlay arrangements,
  native bars and overflow.
- Apple [SwiftUI updates](https://developer.apple.com/documentation/updates/swiftui):
  `ArrangementView`, `.arrangementViewStyle(.split)`, axis/ratio configuration.
- Apple [UIView.ReservedRegion](https://developer.apple.com/documentation/uikit/uiview/reservedregion):
  active division regions differ from occlusions; the system reports their frames.
- Apple [DeviceHinge.angle](https://developer.apple.com/documentation/swiftui/devicehinge/angle):
  hinge information is public. It is not needed to infer a playback layout.
- Apple [Raise the bar with iPhone Duo](https://developer.apple.com/videos/play/tech-talks/111462/):
  system navigation containers participate in vertical bars and system overflow.
- Apple [TN3192](https://developer.apple.com/documentation/technotes/tn3192-migrating-your-app-from-the-deprecated-uirequiresfullscreen-key):
  remove fullscreen compatibility restrictions and support resizing/all orientations.
- Apple [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass):
  standard controls adopt the material; use custom glass sparingly and check accessibility.

Signatures were also verified in the **installed public SwiftUICore SDK interface**:
`ArrangementView(primary:secondary:)`, `GeometryProxy.reservedRegions(kind:options:layoutDirectionBehavior:)`,
`.arrangementViewStyle`, and `.onHingeChange` are available from iOS 27.1.
This corrects the assumption that no public fold-related APIs exist at the research date.

## Implementation

`PlayerScreen` queries active `.division` reserved regions in its own coordinate
space. If one is present, `ArrangementView` arranges the video and a scrollable
control Form using `.split`. Apple owns the direction, usable regions and fold
avoidance. With no active division, the video fills its safe area and the same
advanced controls remain available from a labelled native toolbar action/sheet.
The player instance is retained in PlaybackSession across view reconstruction.

Browsing uses native adaptable tabs on iOS 18+, tabs on iOS 17, and native split
navigation on Mac. SwiftUI/system containers manage bars and safe areas. The
application supports all iOS orientations, does not use `UIRequiresFullScreen`,
and does not use a guessed Info.plist opt-in key for vertical bars.
Liquid Glass is availability-gated at OS 26 with a material fallback.

**No width/height ratio is interpreted as a hinge angle, hardware identity, display
identity, or device pose.** No hardcoded inner/outer dimensions, private API,
accelerometer-based pose guessing, or synthetic fold-state API is used.

## Simulator evidence and remaining acceptance

The **iPhone Duo simulator, iOS 27.1 (24A94425)** ran the Xcode-signed
application with native Keychain/encrypted storage and a local synthetic provider.
The fixture requires both Authorization and a custom source header on every media
request; it uses no real account or service credential.

- **PASS, AVKit**: AES-128 HLS decode, including authenticated key and segment requests;
  protected MP4 decode and source change while paused.
- **PASS, AVKit outer/inner**: opening with playback options already open retains the
  session and menu; playback clock continues through inner/outer transitions.
- **PASS, AVKit Book**: partial opening in landscape places video beside the scrollable
  controls, clear of the system division. Options and source controls remain reachable.
- **PASS, AVKit tabletop**: rotation moves the video above the division and controls
  below. A pause at 124 seconds stays paused across rotation, then resumes; fully
  opening retains playback. This sequence is recorded in `Cinefern-Duo-AVKit.mp4`
  in the task outputs.
- **PASS, VLC UI automation**: actual two-audio MKV track discovery and selection,
  embedded subtitle selection/off, and paused clock/state retained after rotation.
  The playback-intent state is independent of VLC's transient buffering state.
  Complete successful runs exist, but later repeat suites still fail on pause/menu
  activation; repeatability remains unaccepted, as detailed in the handoff.
- **NOT RUN**: Tent, PiP/app switching across transitions, accessibility extremes,
  physical hardware, and third-party services. Simulator results are not physical
  device acceptance. No physical device installation was performed in this follow-up.

The earlier unsigned Keychain failure is superseded by the successful signed
simulator run. No security fallback was added. Some Xcode app screenshots target
an incorrect/cropped Duo display; those captures are not delivered as visual proof.
The AVKit recording explicitly targets the inner simulator display.

See [the handoff](native-test-handoff.md) for commands, fixture setup, exact test
coverage and the remaining platform acceptance matrix.
