# Native Apple migration and parity ledger

Baseline: `aaf38e11d91b828c7d3aa2b5fd600271b18393f1` (Cinefern 5.1.2).
This inventory comes from `docs/features.md`, `src/app-context.tsx`, all screens,
`src/core/`, `src/player/`, `src/providers/`, `src/agent/`, the SDK and provider builder.
It describes **this repository's** working v5 baseline, not an older pre-v5 API.

## Cutover status: blocked pending acceptance

The native client lives under `native/`, with separate bundle IDs, encrypted
storage namespace, optional VLC project, and CI. The working React Native/Electron
entry points, SDK, plugin compiler, examples, release pipelines, and existing
TypeScript core were not replaced. Android has no native migration target.
Do not change the default distribution or delete legacy clients until the gates
below are satisfied. The native app currently supports a substantial workflow
subset; builds and host tests are not full functional parity or Apple acceptance.

## Implemented, with native UI/device acceptance still pending

- Welcome/setup and English/German principal navigation, persistent setup completion.
- Apple-style content shelves/hero, native iOS adaptable tabs, Mac sidebar,
  tvOS tabs, system navigation and availability-gated Liquid Glass controls.
- Combined/provider feeds, movie/series filter, concurrent search, provider/type
  filters, pagination and partial-provider errors. Search discards stale UI responses.
- Media details, artwork, metadata, seasons, ordered episode lists, person/credits,
  provider collections/sorting/pagination, suggestions and provider trailers.
- Composite-key watchlist/history, progress, continue watching, provider/type
  filtering, title sort, watchlist hooks/import, media-open hook, manual episode
  update tracking and badges. These are in-app checks, not push notifications.
- Playback through native AVKit or optional platform VLCKit, source/quality choice,
  source-specific provider audio re-request, speed, seek, volume, resume and
  previous/next/autoplay queue. Header-authenticated HLS/files use a bounded native
  media relay; VLC also supports authenticated DASH. Synthetic iOS playback passes;
  real services and the broader codec/platform matrix remain to be tested.
- In-app sidecar SRT/VTT parsing; native AVKit embedded track controls and system
  PiP/fullscreen/AirPlay availability. No tested end-to-end claim for these routes.
- Review/import `.cfprovider` by file (iOS/Mac) or URL (including TV), install,
  enable/disable/uninstall, typed provider settings and hot reconfiguration.
- Existing Jellyfin authentication/connection/session logic and JSON catalog provider,
  kept in the shared core. Native LAN/privacy/authentication needs device tests.
- Resolver capability dispatch and persisted priority, including direct streams.
- Existing Deep Agents/LangChain agent implementation, fixed vendor endpoints,
  user API-key settings, per-version/tool provider grants, cancellation, quotas,
  citations and read-only browser/search tools. Native JSON transport and reader
  are implemented; no paid model call or external-browser automation was tested.
- Progressive downloads, cancel/retry/remove and confined offline media paths;
  tvOS uses purgeable caches. HLS/DASH segment download is not supported, matching
  the baseline's documented limit. Progress UI currently reports status/completion,
  not continuous byte progress.
- Existing v1 watchlist/history export/import format, merging by composite key and
  newest history. iOS/Mac use document APIs; TV imports by URL. Backups do not carry
  plugin bundles, session credentials, API keys or downloaded files.
- Cache clear, history clear, reset with download/secret removal. Native reset does
  not wipe the separately stored working legacy application.

## Core compatibility verified locally

The original SDK, provider builder, example/agent-example sources, runtime, library,
Jellyfin and agent implementations remain byte-for-byte unchanged in Git.
Unmodified example bundles are compiled by that builder and exercised by Swift
XCTest in **real JavaScriptCore on macOS**, including a scripted full agent/tool path.
The native entry point adds platform transport and application orchestration; it
is not a reimplementation of the SDK or a substitute JavaScript plugin format.

Tests cover boot/restart persistence, merge/progress semantics, example browse/search/
sources, foreign-origin denial, disabled-provider calls, storage permissions and
namespaces, native bridge invisibility, interpreter quota recovery, default-deny
agent access, grant revocation, tool-derived citations, AVKit/VLC source eligibility,
authenticated media transport and fixed runtime thread ownership.
See the exact evidence and limits in [the handoff](native-test-handoff.md).

## Open parity/release gates

- **Physical playback and adaptive UI**: signed Duo simulator playback/layout checks
  now cover outer/inner, Book/tabletop, menu reachability, pause/rotation and source
  changes in successful runs. Repeated VLC pause/menu automation remains unstable.
  Physical iPhone/iPad/Mac/Apple TV acceptance, tvOS remote/focus restoration,
  PiP/AirPlay/background audio/system media keys remain open. Tent is NOT RUN.
- **Authenticated-service coverage**: arbitrary safe source headers are implemented
  through public loopback HTTP APIs for both engines, with real loopback HTTP tests.
  HLS keys/segments, DASH templates and Range/HEAD are covered. Actual third-party
  services, cross-origin authentication negotiation, DRM/FairPlay and advanced live
  manifest extensions remain unaccepted. Authenticated AVKit sources disable AirPlay.
- **Track acceptance**: VLC embedded audio/subtitle selection, off and language matching
  are implemented; the Duo simulator exercises actual track IDs in a two-audio MKV.
  AVKit exposes embedded tracks in system controls. Other platforms/codecs and sidecar
  captions in fullscreen/PiP/external playback still need validation.
- **Presentation preferences**: baseline trailer autoplay/crop, detail page-versus-modal,
  vibrancy preference and desktop mouse-wheel volume behavior are not yet implemented
  in native UI. Native system material responds to OS accessibility settings.
- **Mac desktop features**: Electron always-on-top IPC has no native equivalent yet;
  keyboard/remote command parity, multiple-window ownership and simultaneous player
  presentation require review. The app supports window resizing, not independently
  accepted simultaneous playback in several windows.
- **Downloads/transport**: real download/cancel/offline, local-network privacy prompts,
  native redirect/size controls and actual model endpoints need integration/device
  tests. Host tests inject HTTP replies and do not certify the URLSession implementation.
- **Distribution/assets**: Mac/tvOS icons/top-shelf assets, broader sandboxed
  Keychain acceptance, privacy metadata, optional VLC LGPL distribution obligations,
  public release acceptance remain incomplete. Six Apple Development signed builds
  and deep verification pass; the Duo simulator successfully uses encrypted/Keychain
  storage. The authorized native iOS beta **5.2.0 (6.1)** now has an App Store archive,
  verified Distribution IPA, icon/privacy manifest and **VALID** TestFlight processing.
  Mac/tvOS store archives/assets and physical acceptance remain open.
- **Data migration**: explicit backup portability is available; automatic legacy
  credential/plugin/download migration is intentionally not performed. Add and test
  a reviewed migration path before making native the sole application.
- **CI**: the first follow-up native CI run failed at the SDK prerequisite because
  `macos-26` selected Xcode 26.6. It now uses the documented `xcode-27` preview image
  and still requires 27.1; a successful complete remote native run remains unverified.

Chromecast, UPnP/DLNA and Dropbox sync were already unimplemented in the baseline;
no imaginary backend has been added for them.

## Cutover checklist

1. Close or explicitly scope the open feature gaps above with the owner.
2. Pass the signed build/device matrix and unchanged external plugin fixtures.
3. Verify backup/restore and deliberate migration from a representative v5 library.
4. Validate accessibility, localization, errors, LAN/privacy prompts and credential
   isolation on each platform; audit the native bridge and optional VLC packaging.
5. Obtain explicit release acceptance, then change the distribution entry points in
   a separate review. Keep rollback packages and an exported v5 library available.
