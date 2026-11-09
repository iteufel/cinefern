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
space. A single `ArrangementView` keeps the video in its primary slot across
transitions. Its split axes are enabled only while a division is active; otherwise
it shows the primary video alone. Apple owns the direction, usable regions and
fold avoidance. Advanced controls remain available from a labelled native toolbar
action/sheet, and appear inline in the divided layout. Both the video surface and
its owning PlaybackSession retain their identity when the division changes.

VLC transport controls use text labels when they fit and labelled icons when the
pane is narrow or text is enlarged. Buttons have at least 44-point hit targets.
The Form's two seek buttons use an explicit borderless style so a tap invokes
only one action, rather than SwiftUI's shared automatic row action.

Browsing uses native adaptable tabs on iOS 18+, tabs on iOS 17, and native split
navigation on Mac. SwiftUI/system containers manage bars and safe areas. The
application supports all iOS orientations, does not use `UIRequiresFullScreen`,
and does not use a guessed Info.plist opt-in key for vertical bars.
Liquid Glass is availability-gated at OS 26 with a material fallback.

**No width/height ratio is interpreted as a hinge angle, hardware identity, display
identity, or device pose.** No hardcoded inner/outer dimensions, private API,
accelerometer-based pose guessing, or synthetic fold-state API is used.

## Follow-up validation — 9 November 2026

Scope: the **draft SwiftUI client**. The released React Native client and its
release pipeline are unchanged. Toolchain: Xcode 27.2 (27B52), Duo simulator
runtime iOS 27.2.iPhone19.4. No physical device or store upload was used.

- **PASS:** native TypeScript check, 17 Swift Core tests, root TypeScript check
  and 64 existing JavaScript tests.
- **PASS:** AVKit iOS, macOS and tvOS builds; Xcode-signed AVKit and VLC iOS
  simulator builds. The local VLC build required the invocation-only
  `ENABLE_USER_SCRIPT_SANDBOXING=NO` override after CocoaPods' framework copy
  failed on `_CodeSignature` file access. Project sandbox settings are unchanged.
- **PASS:** `testAVKitPausedPlaybackSurvivesRotationAndSourceChange` on Duo's
  outer display. It plays authenticated synthetic HLS, pauses, advances exactly
  15 seconds, rotates, switches to authenticated MP4 while retaining the paused
  position, resumes, and closes. The new seek assertion failed before the
  `.borderless` row fix and passed afterward. An intermediate run also hit
  XCTest's invalid offscreen activation-point error; the test now scrolls back
  before querying the paused control.
- **PASS, manual:** updated VLC playback on the outer display at default and
  maximum accessibility text sizes. All four transport controls remain visible;
  the icon-only Pause action changes to Play when activated. Rotation retains
  the active player.
- **Baseline observed:** provider setup, authenticated HLS on outer/inner
  displays, side-by-side controls in the divided layout, and paused position
  retained at 136 seconds through rotation and return to the outer display.
  The device tool dispatched fold changes but could not read a hinge-angle
  sample. Screenshots confirmed the display/layout changes; **numeric hinge
  verification and a complete post-change fold/pose matrix remain unaccepted**.

To repeat the AVKit regression, first run the fixture server and install/enable
its bundle as described in [the handoff](native-test-handoff.md), then use:

```sh
xcodebuild -project native/Cinefern.xcodeproj -scheme Cinefern-iOS \
  -configuration Debug -destination 'platform=iOS Simulator,id=YOUR_DUO_UDID' \
  -parallel-testing-enabled NO \
  -only-testing:Cinefern-UITests/PlayerUITests/testAVKitPausedPlaybackSurvivesRotationAndSourceChange test
```

This does not supersede the remaining physical-device, Tent, PiP/AirPlay,
third-party-service, or repeated VLC acceptance gates below.

## Earlier simulator evidence — 24 October 2026

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
