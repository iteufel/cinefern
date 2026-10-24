# Native Apple: test evidence and handoff

Status: **native iOS beta delivered / production acceptance pending**, 24 October 2026.
Baseline: `aaf38e11d91b828c7d3aa2b5fd600271b18393f1`.
Branch: `codex/native-apple-migration`; draft PR: https://github.com/iteufel/cinefern/pull/1.

## Native iOS TestFlight delivery

At the owner's explicit release request, **5.2.0 (6.1)** was uploaded to the existing
Cinefern iOS app record. Apple processing returned **VALID**, internal state
**READY_FOR_BETA_TESTING**, at 2026-10-24 20:48 UTC. The exported production IPA's
deep strict Apple Distribution signature, App Store profile, bundle/version,
iPhone/iPad icons, runtime and real VLC framework were verified. No physical
installation or new tester invitation is implied by this delivery.

[Release run](https://github.com/iteufel/cinefern/actions/runs/40130798020),
source `f371c10ccdfe9c144f36919bb522dedab434f6ee`, Apple build
`70572eca-3323-411c-a4f4-75163b586a7d`. See [TestFlight instructions](testflight.md)
for the manual native release path. The earlier six development builds and UI
acceptance limitations below are separate evidence; they remain relevant.

## Confirmed local evidence

Xcode 27.1 (`27A9275`), Swift 6.4, arm64 Mac, macOS 27 SDK,
iOS/tvOS 27.1 SDKs; CocoaPods 1.17.0. Optional MobileVLCKit/TVVLCKit 3.7.4,
macOS VLCKit 3.7.3, pinned by Podfile.lock.

- **PASS** root TypeScript typecheck and **64 existing tests** (`npm run check`).
- **PASS** separate strict native TypeScript typecheck (`npm run apple:typecheck`).
- **PASS** both unchanged example providers built by the original compiler.
- **PASS** **17 Swift XCTest tests**: the original eight JavaScriptCore tests,
  eight media transport/track tests, and a fixed-thread completion regression test. JavaScriptCore coverage includes unchanged
  catalog/research bundles, persistence/backup/progress, lifecycle/settings,
  native bridge isolation, origin/storage/quota boundaries, a full scripted
  Deep Agents/tool/citation path, grants and source eligibility.
- **PASS** actual loopback HTTP tests for authenticated binary Range/HEAD; HLS
  playlist/key/segment rewriting; DASH templates including actual segment HTTP;
  cross-origin credential stripping; redirect denial; capability revocation;
  injection/transport-header rejection; XML safety; actual VLC track IDs/locale matching.
- **PASS** all **six Apple Development signed Debug device builds**: iOS/iPadOS,
  native macOS (verified universal arm64/x86_64 executables), tvOS, each with AVKit and actual
  platform VLCKit. Deep strict signature verification passed for every app,
  with Apple Development authority and the configured development team, not ad-hoc.
- **PASS** signed iPhone Duo simulator startup and native encrypted/Keychain storage.
- **PASS** actual AVKit AES-128 HLS decode and authenticated key/segment requests;
  protected MP4 decode and source change while paused on the Duo simulator.
- **PASS** actual VLC MKV track discovery (two audio tracks), audio selection,
  embedded subtitle selection/off, pause and rotation retaining pause/clock in
  complete successful runs. Repeatability is not accepted; see limitations below.
- **PASS** AVKit Duo outer/inner transitions with options open, Book beside-controls
  layout, tabletop video-above-controls layout, pause/rotate/resume and fully open.
  See task output `Cinefern-Duo-AVKit.mp4` and [Duo evidence](native-duo.md).
  The recording precedes the executor hardening; the arrangement implementation
  is the same, and the later VLC automation is recorded separately in test logs.
- **PASS** SDK, original core/providers/agent implementations, provider builder and
  original examples have no tracked changes relative to the repository baseline.

The 17 Core tests are separate from the iOS UI test. Plugin/agent HTTP is scripted
and storage uses MemoryStorage in those original tests; the added relay tests use
actual URLSession/NWListener. Simulator playback uses native Keychain storage,
real AVKit/VLC decoders and generated synthetic media. It proves no paid model,
LAN Jellyfin or real third-party service compatibility. No physical device was
installed or tested in this follow-up; the requested runtime was the Duo simulator.

## Reproduce builds and tests

```sh
npm ci --ignore-scripts
npm run apple:prepare
npm run check
npm run apple:typecheck
npm run apple:test
CINEFERN_TEAM=YOUR_TEAM npm run apple:build -- avkit
npm run apple:vlc
CINEFERN_TEAM=YOUR_TEAM npm run apple:build -- vlc
```

Without `CINEFERN_TEAM`, the script builds unsigned generic-device applications.
Use an existing valid team/certificate/provisioning setup. Simulator apps use
Xcode simulator signing; the six device-build signatures above use the real certificate. No secrets or signing
files belong in this repository. Verify each built app with:

```sh
codesign --verify --deep --strict PATH_TO_APP
codesign -dv --verbose=4 PATH_TO_APP
```

For a restricted host sandbox, the Core test command used was:

```sh
CLANG_MODULE_CACHE_PATH=/tmp/cinefern-module-cache \
  swift test --disable-sandbox --package-path native \
  --scratch-path /tmp/cinefern-native-swift-build
```

Xcode plugin processes, signing/keychain, local HTTP listeners and Simulator services
needed execution outside that sandbox. A sandbox restriction is not a source failure.
Build logs default to `native/.build/xcode-{avkit,vlc}/{iOS,macOS,tvOS}.log`;
`CINEFERN_BUILD_ROOT` overrides the output root. The workflow builds unsigned and requires Xcode 27.1. The first follow-up CI run
[failed before compilation](https://github.com/iteufel/cinefern/actions/runs/40125721458)
because `macos-26` selected Xcode 26.6. The workflow now uses GitHub's documented
[`xcode-27` preview image](https://github.com/actions/runner-images/issues/14404),
retaining the 27.1 requirement. Remote success is a separate check, not established
by local signing.

## Synthetic media / Duo UI reproduction

Requirements: ffmpeg on PATH, prepared runtime/Pods and a booted iOS 27.1 Duo simulator.
The local fixture server generates its own five-minute H.264/AAC test pattern,
AES-128 HLS, DASH and two-audio/subtitle MKV/MP4. All `/media/` requests require
both fixed **test-only** Authorization and custom headers; logs record only a boolean
and Range/path/method. The fixture does not accept a real credential.

```sh
python3 native/scripts/serve-media-fixture.py
```

In the signed simulator app: finish setup, import
`http://127.0.0.1:42187/fixture.cfprovider` under Providers, install and **enable** it.
Use the optional VLC workspace and select the VLC engine in Settings. Keep the
server running. The UI test selects VLC with the standard UserDefaults launch
argument, opens the local fixture via Explore, exercises tracks and pause/rotation.
It has no production test backdoor or mock player:

```sh
xcodebuild -workspace native/CinefernVLC.xcworkspace -scheme Cinefern-iOS \
  -configuration Debug -destination 'platform=iOS Simulator,id=YOUR_DUO_UDID' \
  DEVELOPMENT_TEAM=YOUR_TEAM CODE_SIGNING_ALLOWED=YES 'CODE_SIGN_IDENTITY=Apple Development' \
  -only-testing:Cinefern-UITests/PlayerUITests test
```

The simulator's native UI automation screenshots can select a cropped/wrong Duo
display; those are not supplied as visual acceptance. Capture the active display
explicitly with `simctl io ... screenshot --display=...` / `recordVideo` after
checking the simulator's display IDs. Earlier unsigned Keychain errors are superseded by the working Xcode-signed app.
The additional end-to-end DASH automation was not accepted: it encountered missing/
clipped menu elements. Earlier runs also crashed with a JavaScriptCore JIT
execute-permission fault. The host now confines all JS execution to one background
OS thread, including timer/native completions, with timer coalescing preserved.
A regression test verifies thread identity across twelve asynchronous native replies.
No JIT configuration or protection was disabled, and no SDK root cause is asserted.
DASH manifest/segment HTTP passes; native DASH decoder continuity remains unaccepted.
The successful MKV track/paused-rotation scenario is separate from these failing attempts.
After the fixed-thread change, the first three-repeat MKV run completed twice
and timed out once at pause; no JavaScriptCore crash occurred in that run. The
final repeat run still failed on clipped/invalid button activation points and a
pause timeout. This is **not a green repeated UI suite**. Audio/subtitle assertions
passed before those failures. The Mac had locked and Device Hub interaction was
unavailable; that is an observation, not an established cause of the XCTest failures.
Repeat interactive Duo pause/rotation acceptance after restoring the host session.
Longer runtime stress and conclusive JavaScriptCore stability remain release gates.

## Remaining acceptance matrix

These cases are **NOT RUN / unaccepted** unless explicitly listed above:

- iPhone/iPad accessibility extremes, split-window sizes, interruptions/background
  audio, PiP, AirPlay; physical Duo and Tent, app switching/PiP across fold transitions.
- Mac runtime on arm64/Intel, minimum/large windows, fullscreen, keyboard/media keys,
  sandbox permissions, window ownership; signed compilation is not runtime acceptance.
- Apple TV physical remote/focus/Back/Menu, long forms, dismissal focus restoration,
  overscan and purgeable-download recovery; no usable tvOS simulator was installed.
- Older supported OS runtimes (iOS/tvOS 17, macOS 14), OS 26 materials.
- Real external provider bundles/services, Jellyfin LAN/login/proxy/transcode, JSON
  catalogs, actual live streams and broad codec/platform coverage.
- Header-authenticated cross-origin CDNs needing different credentials, redirect or
  cookie negotiation, DRM/FairPlay and advanced live HLS/DASH extensions. The relay
  deliberately strips source credentials outside the original origin and denies redirects.
  Authenticated AVKit relay URLs disable AirPlay because remote receivers cannot reach them.
- Sidecar subtitles in AVKit system fullscreen/PiP/external playback; track defaults
  and selection on macOS/tvOS; VLC PiP/AirPlay/system media-command parity.
- Real progressive download/cancel/retry/offline/purge, model endpoints and privacy
  prompts, deliberately authorized paid-service smoke test, complete backup/migration.
- Mac/tvOS store icons/top-shelf/privacy metadata, their store archives, ongoing VLC
  distribution obligations and public release acceptance. The iOS icon/privacy
  manifest, store archive and processed TestFlight beta are now delivered.

The parity ledger lists remaining preferences/desktop features. Legacy clients and
release entry points remain the rollback path. Public release acceptance is not implied by local builds or simulator results;
the separately authorized TestFlight delivery is recorded above.
