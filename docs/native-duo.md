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

## Modes and remaining evidence

- Closed / outer display: native containers adapt to the space the system provides.
- Open / inner display: native containers can expose more content. Exact behavior
  must be checked in the signed application on the device.
- Partially open / Book: system division information drives arrangement; no guessed
  vertical half-window boundary.
- Partially open / tabletop: the same arrangement supports a horizontal system
  division; video/control order and comfort need a real playback test.
- Tent: the system decides which display/scene is active. This application does not
  claim to detect Tent independently or to force display switching.
- Opening/closing while playing: the retained player is designed to preserve the
  session; presentation and OS lifecycle behavior are **not yet accepted on hardware**.

The Duo simulator/runtime was present locally. Its unsigned app initially launched
but Keychain returned `-34018`. A manual ad-hoc-signing experiment did not produce a
successful relaunch. No Book/Tent/tabletop test is counted as passed. Do not treat
SDK compilation, device enumeration or an app launch PID as evidence of posture,
continuity, playback or right-menu reachability.

Use the signed-device scenario list in [the handoff](native-test-handoff.md).
