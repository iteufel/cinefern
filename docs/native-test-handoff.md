# Native Apple: test evidence and agent handoff

Status: **draft / no native release acceptance**, 24 October 2026.
Repository baseline: `aaf38e11d91b828c7d3aa2b5fd600271b18393f1`.
Branch: `codex/native-apple-migration`.

## Confirmed local evidence

Environment: Xcode 27.1 (`27A9275`), Swift 6.4, arm64 Mac,
macOS 27 SDK, iOS/tvOS 27.1 SDKs. CocoaPods 1.17.0.

- **PASS** `npm run check`: root TypeScript typecheck and **64 existing tests**.
- **PASS** `npm run apple:typecheck`: separate strict typecheck of the native
  TypeScript entry point/browser declarations and its shared-core imports.
- **PASS** both unchanged example provider build commands via the existing builder.
- **PASS** **8 XCTest tests in macOS JavaScriptCore**, covering:
  - startup and library/settings persistence across two contexts;
  - backup merge/history/progress and unsafe direct-source rejection;
  - native bridge invisibility to interpreted providers and AVKit/DASH/VLC eligibility;
  - provider initialization, disposal, disable/re-enable and settings reconfiguration;
  - unchanged catalog example browse/search/sources and exact-origin denial;
  - storage permission and actual separate provider namespaces;
  - interpreter execution-quota termination and subsequent queue recovery;
  - unchanged research example default denial, full Deep Agents/tool execution
    with scripted model HTTP, observed-source citations and grant revocation.
- **PASS** unsigned generic iOS device build (one target includes iPhone **and iPad**), AVKit.
- **PASS** unsigned native macOS build (arm64/x86_64), AVKit.
- **PASS** unsigned generic tvOS device build, AVKit.
- **PASS** corresponding iOS, native macOS, tvOS builds linked against the real,
  pinned **MobileVLCKit/TVVLCKit/VLCKit** frameworks. These compile the VLC adapter,
  not only its `#if canImport` fallback.
- **PASS** AVKit iOS simulator compilation (before the final small navigation refinements).
- **PASS** Git diff check: SDK, core, providers, agent sources, builder and original
  example providers have no tracked modifications.

The 8 Swift tests include actual interpreter/plugin and scripted agent execution;
they are not a count of TypeScript tests, media playback tests or physical tests.
HTTP is injected in provider/agent tests. Keychain uses MemoryStorage in these
unit tests. No paid vendor request, LAN Jellyfin request, actual stream decode,
URLSession integration, real download or physical-device operation is certified.

## Attempted but not accepted

An iOS 27.1 iPhone Duo simulator was available and booted. The unsigned client
launched, then correctly failed closed because Keychain access returned `-34018`.
A manual ad-hoc-signing attempt failed to relaunch. Device Hub accessibility was
unavailable to the automation. Neither attempt counts as a UI, playback, pose or
continuity pass. No failing screenshot is delivered as success evidence.

No usable tvOS simulator runtime was installed. Device enumeration/building for a
generic tvOS destination is not a Siri Remote/focus test.

## Reproduce local checks

```sh
npm ci --ignore-scripts
npm run apple:prepare
npm run check
npm run apple:typecheck
npm run apple:test
npm run apple:build -- avkit
npm run apple:vlc
npm run apple:build -- vlc
```

If working in a restricted filesystem sandbox, Swift needs a writable module
cache. The local XCTest run used:

```sh
CLANG_MODULE_CACHE_PATH=/tmp/cinefern-module-cache \
  swift test --disable-sandbox --package-path native \
  --scratch-path /tmp/cinefern-native-swift-build
```

Xcode macro/plugin processes and Simulator services also required execution outside
that sandbox. Do not interpret a sandbox process-launch failure as a source compile
failure. Native builds use public SDK symbols, not stubbed framework declarations.

Build logs are written by the script to
`native/.build/xcode-avkit/{iOS,macOS,tvOS}.log` and
`native/.build/xcode-vlc/{iOS,macOS,tvOS}.log`; set `CINEFERN_BUILD_ROOT` to override.
The added native GitHub workflow runs these checks and uploads logs, requires
Xcode 27.1, and does not release anything. **Remote CI is unverified here.**

## Next agent: signed builds first

1. Read `native/README.md`, `docs/native-migration.md` and `docs/native-duo.md`.
2. Run preparation and tests above. Open the AVKit project or optional VLC workspace.
3. Select the owner's real development team in Xcode and valid signing configuration.
   Do not add a plaintext storage fallback to hide a Keychain/signing failure.
4. Run iOS on a signed simulator/device and Mac/tvOS in the intended sandbox/signing
   configuration. Verify encrypted storage across relaunch and revoked/unavailable
   Keychain behavior. Test secrets, reset and bundle-ID separation from the legacy app.
5. For each following scenario record: hardware/runtime, OS, signing/build/commit,
   player engine, provider/source codec, result, screenshot/short recording, and logs
   with credentials redacted. Mark an unrun case **NOT RUN**, not pass.

## Required device/UI matrix (all NOT RUN / not accepted)

- **iPhone**: compact portrait/landscape; source/track/menu access; dynamic type,
  VoiceOver, reduce motion/transparency; interrupted/background playback; PiP and AirPlay.
- **iPad**: portrait/landscape, Split View narrow/half/wide, continuous window resize,
  keyboard visible, large dynamic type. Reach options, close/back, source list,
  subtitle/audio selection and last Form row at every size.
- **Mac**: arm64 and Intel where supported, minimum/large windows, fullscreen, keyboard,
  track controls, system media keys, signed sandbox permissions and multiple windows.
- **Apple TV**: real remote focus, Back/Menu and play/pause behavior, scrolling long
  provider/settings/control forms, source selection, dismissal focus restoration,
  overscan/safe areas and purgeable download recovery.
- **iPhone Duo**: signed outer→inner→outer while media plays and while paused;
  both orientations, Book, tabletop/half-open, Tent and fully flat; fold/unfold with
  advanced menu already open; app switch/PiP during a transition. Check position,
  pause state, sound, no duplicate player, correct reserved-region avoidance,
  safe-area/vertical toolbar overflow and reachable playback options.
- **Fallback OS**: iOS/tvOS 17 and macOS 14; OS 26 glass; iOS 27.1 Duo APIs.
  Build availability guards alone do not prove runtime or accessibility behavior.

## Required provider/player matrix (NOT RUN against real services)

Run every relevant source through **both engines on each platform**:

- Unchanged catalog example and real existing third-party `.cfprovider` bundles.
- Jellyfin sign-in/logout/relaunch, reverse-proxy path, LAN privacy prompt,
  direct-play H.264/AAC, HLS transcode, multiple/commentary audio, VTT subtitles.
- JSON catalog browse/search/pagination and local network/HTTPS errors.
- HLS/file/DASH, live streams, seek/resume, source change while paused,
  episode autoplay, timeout/error/retry, source-specific audio negotiation.
- Sources with no headers; VLC User-Agent/Referer; **known unsupported** arbitrary
  authentication headers. Implement and test public authenticated transport before
  claiming the latter are compatible.
- Embedded and sidecar subtitles, locale matching, fullscreen/PiP/AirPlay differences.
- Progressive download/cancel/retry/remove, offline restart, missing/purged file,
  invalid/out-of-root local path and interrupted application lifetime.
- Bad/oversized bundle, settings types, initialize failure/dispose, disabled calls,
  storage isolation, origin/redirect/response-size boundaries and quota recovery.
- Agent disabled/no key/no provider grant/tool revoked/version changed, in-flight
  disable, cancellation, limits, citation grounding and one explicitly authorized
  paid-service smoke test. Do not infer paid-service behavior from scripted HTTP.
- Import a populated v5 export, merge without data loss, restart, resume; ensure
  provider credentials/API keys never enter a portable backup or log.

## Acceptance and rollback

Use the parity ledger's open gates; several feature preferences/desktop behaviors
and VLC track controls still need implementation. No native release, TestFlight
upload, default-entry switch or deletion of the legacy client is authorized by the
local test results. A later release needs explicit acceptance after these checks.
The working v5 client remains available as the rollback path.
