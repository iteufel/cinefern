# Native Apple client (parallel migration)

SwiftUI applications for iPhone/iPad, native macOS (not Catalyst), and Apple TV.
This is a **draft migration**, not an approved replacement for Cinefern 5.
The existing React Native/Electron clients and their release workflows remain available.
No native Android target is planned.

## Build

Requirements: Xcode **27.1** (Duo APIs), Node 22.13+, npm; CocoaPods and the
`xcodeproj` Ruby gem only for optional VLC builds or project regeneration.

From the repository root:

```sh
npm ci --ignore-scripts
npm run apple:prepare
npm run apple:typecheck
npm run apple:test
npm run apple:build -- avkit
```

Open `native/Cinefern.xcodeproj`. Shared schemes:

- `Cinefern-iOS`: iPhone and iPad, iOS 17+.
- `Cinefern-macOS`: macOS 14+, arm64 and x86_64.
- `Cinefern-tvOS`: tvOS 17+.

The build script defaults to unsigned generic-device applications. Set
`CINEFERN_TEAM` to your existing development team for actual Apple Development
signing (automatic provisioning must already be configured):

```sh
CINEFERN_TEAM=YOUR_TEAM npm run apple:build -- avkit
CINEFERN_TEAM=YOUR_TEAM npm run apple:build -- vlc
```

The signed Duo simulator app successfully uses the native Keychain/encrypted store.
An unsigned simulator app may fail Keychain access with `-34018`; keep signing
configured rather than replacing secure storage with a plaintext fallback.

Optional VLC:

```sh
npm run apple:vlc
npm run apple:build -- vlc
```

Open `native/CinefernVLC.xcworkspace` for the optional variant. The separate generated
VLC project keeps CocoaPods from changing the AVKit-only project. The lockfile pins
MobileVLCKit/TVVLCKit 3.7.4 and desktop VLCKit 3.7.3. Do not open the generated
VLC `.xcodeproj` without its workspace. The Settings player picker exposes VLC
only when the appropriate platform module is linked. It reports an unavailable
saved VLC selection rather than silently changing engines.

Rebuild runtime resources after editing shared TypeScript or its dependencies:

```sh
node native/scripts/build-runtime.mjs
```

`apple:prepare` also builds **both original example providers with the original
builder** and copies those exact bundles to Swift test fixtures. Generated JavaScript,
fixtures, Pods, and DerivedData are ignored. A fresh clone must run preparation first.
The committed AVKit Xcode project can be regenerated using
`ruby native/scripts/generate-project.rb` (requires `xcodeproj`).

## Runtime boundary

- SwiftUI owns navigation and native playback. There is no React Native, Electron,
  WKWebView, or DOM in the native application.
- JavaScriptCore runs the **existing** `ProviderRuntime`, `LibraryStore`, Jellyfin,
  JSON library, MediaAgentService, Deep Agents engine, and subtitle parser.
- Third-party provider bundles still execute through **SandboxJS**, with its
  execution quota. They are never evaluated directly with JavaScriptCore.
- The SDK, `.cfprovider` format, API version, and provider compiler are unchanged.
  The provider receives only its existing context, not the native bridge.
- One dedicated background thread owns the context, promises, and timer deliveries.
  SwiftUI exchanges Codable JSON values over asynchronous calls.
- Browser primitives (URL including IDN handling, encoding, fetch response objects,
  streams, cancellation, structured clone, secure random bytes) are installed before
  the trusted core. Network I/O is URLSession; model transport supports JSON requests,
  not arbitrary SDK upload endpoints. No Node filesystem or process API is supplied.
- Provider exact-origin checks, storage permissions/namespaces, manifest validation,
  initialization/disposal, timeout/quota, result validation, resolver dispatch,
  agent version/tool grants, cancellation, budgets, and citations remain in that core.
- Native HTTP normalizes URLs, disables shared credentials/cookies/cache, denies
  redirects, and bounds responses. Providers depending on redirects must use the
  final declared URL. Native transport failures return a generic message rather
  than credential-bearing server payloads.
- Native library/settings/provider storage is AES-GCM encrypted; a device-local
  Keychain key protects it. Storage is separate from the working legacy client.
  No automatic destructive migration of its existing files or credentials occurs.

JavaScriptCore is a suitable host for the current bundled interpreter and tested
agent path after supplying these browser primitives. Passing that test does **not**
establish arbitrary plugin, native transport, codec, or physical-device compatibility.

## Player limits

AVKit uses public AVPlayer/AVPlayerViewController/AVPlayerView APIs, including
system controls, PiP, fullscreen and AirPlay where offered by the platform.
It accepts HLS/files; DASH needs VLC. Header-authenticated sources use the same
public, per-session loopback HTTP relay with either engine. The relay forwards source
headers only to the exact original origin, streams binary media with Range/HEAD,
and rewrites HLS playlists/keys/maps and DASH BaseURL/segment templates. It uses
random capability routes, bounded manifests/connections/headers and no shared
cookies, credentials or cache. Redirects are denied. Transport-managed headers
such as Host, Range and Connection cannot be overridden by provider headers.
Cross-origin children receive no source credentials; authenticated cross-origin
CDNs therefore need a provider source at the appropriate origin. No private
`AVURLAsset` header key or unsupported VLC header option is used.

Authenticated AVKit relay sources disable AirPlay because the receiver cannot
reach the device-local URL. Direct sources keep system external-playback support.
This transport does not implement DRM/FairPlay, cookie negotiation, arbitrary DASH
extensions, or HLS variable substitution/content steering. AES-128 HLS is covered
by the synthetic playback fixture, not a DRM compatibility claim.

The advanced controls are in a system toolbar and scrollable Form/sheet, not a
fixed panel positioned beyond the right edge. A retained PlaybackSession owns the
player independently of layout; source changes preserve position and pause state.
Sidecar SRT/VTT subtitles overlay the in-app surface; test their behavior in AVKit
system fullscreen/PiP/AirPlay before promising them there. VLC embedded audio/subtitle menus use actual VLC track IDs, language preferences,
and an explicit subtitle-off choice; embedded and sidecar subtitles are mutually
exclusive. Requested playback state is retained independently of transient buffering,
and existing drawables are not reassigned on every SwiftUI update. VLC PiP/AirPlay
and system media-command parity remain open. See the handoff for the synthetic
media fixture and the signed Duo simulator test.

## Documentation

- [Migration and feature parity](../docs/native-migration.md)
- [Build evidence and test handoff](../docs/native-test-handoff.md)
- [Public iPhone Duo APIs and limits](../docs/native-duo.md)
