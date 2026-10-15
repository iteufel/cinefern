# Cinefern for Apple TV

The built-in **Jellyfin** provider connects directly from the TV: open **Providers → Jellyfin → Connect** and enter
the server address and account credentials. See [Jellyfin setup](jellyfin.md) for playback and network requirements.

The Apple TV app shares the React Native screens, provider runtime, watchlist, history, downloads, and TypeScript SDK with the other platforms. It has its own tvOS application (`io.github.iteufel.cinefern.tv`), TV navigation and player, layered app icons, and static top-shelf artwork.

## Build and run

Install Node.js 22.13+, a compatible full Xcode installation with the tvOS SDK and an Apple TV simulator runtime, and CocoaPods. SDK 57's native toolchain requirements are listed in the [Expo compatibility table](https://docs.expo.dev/versions/latest/). This project targets tvOS 16.4 or newer.

From the repository root:

```sh
npm ci
npm run tvos:generate
npm run tvos -- --device
```

Select an Apple TV simulator or a paired Apple TV. `expo run:ios` installs pods and builds the tvOS project; the command name remains `ios` because Expo treats tvOS as an Apple build target. `npm run tvos:start` starts its Metro server separately on port 8082.

`apps/tv/ios` is generated and ignored. It is separate from the phone project's root `ios` directory, so TV generation does not overwrite the iPhone project. The TV config plugin is always enabled in `apps/tv/app.json`; no `EXPO_TV` environment variable or dependency switching is needed.

For an unsigned release build for the simulator:

```sh
cd apps/tv/ios
pod install
cd ../../..
xcodebuild -workspace apps/tv/ios/CinefernTV.xcworkspace \
  -scheme CinefernTV -configuration Release -sdk appletvsimulator \
  -destination 'generic/platform=tvOS Simulator' \
  -derivedDataPath build/tvos CODE_SIGNING_ALLOWED=NO
```

The application is written to `build/tvos/Build/Products/Release-appletvsimulator/CinefernTV.app`. A manual GitHub Actions run builds the same artifact. For physical devices, select the CinefernTV scheme in Xcode and configure your team/signing. EAS profiles live in `apps/tv/eas.json`; run EAS from that directory and supply your own project and tvOS provisioning profile for distribution. See [Expo's TV build and credentials guide](https://docs.expo.dev/guides/building-for-tv/).

For installation through TestFlight, the separate **TestFlight** GitHub Actions workflow
builds a signed Apple TV device archive and uploads the IPA to App Store Connect.
See [TestFlight account and CI setup](testflight.md).

## Siri Remote

- Directional controls move between the glass sidebar, cinematic shelves, titles, and buttons. A white highlight and gentle enlargement identify focus. Opening details keeps the underlying screen mounted, so Back restores the selected title and shelf position.
- Select opens a title. Hold Select on a poster to save/remove it from the watchlist. Details also has a Save button.
- Search and provider settings use the tvOS text-entry interface.
- Back returns through detail screens and dismisses dialogs. At a main screen it opens the sidebar; a second Back from the sidebar returns to the tvOS Home screen. Sidebar switches do not accumulate a history of tabs.
- The player presents AVPlayerViewController. AVKit handles Play/Pause, scrubbing, transport focus, captions, and fullscreen dismissal with the standard Siri Remote behavior.
- Native transport-bar menus include audio language, subtitles, speed, source/quality, and the episode queue. Jellyfin audio changes request the exact server track, including commentary tracks, and preserve position, speed, and pause state. Late-arriving embedded tracks update the menus as they become available.
- Navigation surfaces use real Liquid Glass on supported tvOS 26 configurations, with an opaque fallback for older systems and Reduce Transparency. Build with Xcode 26.4 or newer to enable the current system appearance.

## Providers and library

All providers start disabled, and no demo catalog is loaded. Build providers with `npm run plugin:build -- path/to/provider.ts path/to/manifest.json` as on the other platforms. Host the resulting `.cfprovider` file on your server. In **Providers → Install provider**, enter its URL, review the manifest and requested network access, and install. Enable the installed provider when you want to use it; downloading or installing a disabled bundle does not execute it.

The included **Your Library** provider also accepts a hosted JSON catalog URL. Use HTTPS for public servers; local HTTP servers need to satisfy Apple's local-network transport rules. Catalogs and media are fetched directly by the TV app, without browser CORS restrictions.

Watchlists, history, installed providers, and settings are stored on the Apple TV. **Settings → Library backup → Import** can merge a hosted Cinefern 5 library export. tvOS has no document picker, share sheet, or general-purpose browser, so file export and website-opening controls are omitted. Create/export backups on another Cinefern platform; there is no automatic cross-device sync.

## Playback and storage limits

Use HLS or files in formats supported by AVPlayer. DASH-only sources cannot play on tvOS; resolvers and providers must supply a compatible alternative.

Downloads cache progressive files, not HLS/DASH segments. tvOS can purge cached files and application caches when storage is needed. Missing downloaded files are reported and can be downloaded again; local storage is not a durable cloud backup. External VTT/SRT subtitles render in the TV player's overlay; picture in picture uses embedded subtitles.

## Development and validation

The root `react-native` dependency aliases `react-native-tvos@0.86.3-0` for both phone and TV. The root override prevents npm from installing a second phone-only runtime through peer dependencies. TV-specific Metro resolution selects `*.tv.tsx` / `*.tv.ts` only for the TV app.

Unsupported document-picker, sharing, and DOM webview modules are excluded from tvOS autolinking. The TV build compiles React Native and Expo modules from source to avoid iOS-only precompiled artifacts. The local `@cinefern/apple-player` Expo module adds menus and sidecar captions to the existing AVKit player using public UIKit APIs. TV media files use the cache directory. `scripts/tv-assets.mjs` packages the shared icon master into the committed icon layers and top-shelf images; regenerate with `npm run tvos:assets`.

```sh
npm run check
npm run build:tvos
```

Hermes export checks the TV JavaScript module graph, not native compilation. Automated checks cover navigation stacks, audio identities without Apple track IDs, exact Jellyfin track negotiation, transport-state restoration, hosted documents, and the shared provider/library behavior. Native compilation, Siri Remote focus, Liquid Glass, AVKit menus, and playback still require simulator/device testing. Open Xcode to accept its license and install the tvOS runtime before running these checks. The native CI job has been configured but has not been run from this workspace.
