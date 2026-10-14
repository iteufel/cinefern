# Cinefern for Apple TV

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

## Siri Remote

- Directional controls move between tabs, titles, and buttons. The mint border marks the focused item; focus guides remember the last control in a region.
- Select opens a title. Hold Select on a poster to save/remove it from the watchlist. Details also has a Save button.
- Search and provider settings use the tvOS text-entry interface.
- Back returns through screens and dismisses dialogs. In the player it closes playback and saves progress.
- Play/Pause toggles playback. When controls are hidden, Left/Right skip ten seconds; Select or Up/Down reveals controls. While controls are visible, directional presses navigate buttons.
- Playback options include source/quality, speed, audio tracks, embedded or VTT/SRT subtitles, and the episode queue. The player supports automatic next episodes and picture in picture.

## Providers and library

Build providers with `npm run plugin:build -- path/to/provider.ts path/to/manifest.json` as on the other platforms. Host the resulting `.cfprovider` file on your server. In **Providers → Install provider**, enter its URL, review the manifest and requested network access, and install. Merely downloading a bundle for review does not execute it.

The included **Your Library** provider also accepts a hosted JSON catalog URL. Use HTTPS for public servers; local HTTP servers need to satisfy Apple's local-network transport rules. Catalogs and media are fetched directly by the TV app, without browser CORS restrictions.

Watchlists, history, installed providers, and settings are stored on the Apple TV. **Settings → Library backup → Import** can merge a hosted Cinefern 5 library export. tvOS has no document picker, share sheet, or general-purpose browser, so file export and website-opening controls are omitted. Create/export backups on another Cinefern platform; there is no automatic cross-device sync.

## Playback and storage limits

Use HLS or files in formats supported by AVPlayer. DASH-only sources cannot play on tvOS; resolvers and providers must supply a compatible alternative. Open Cinema's current full Sintel source is DASH-only; its trailer and the other compatible films can play on Apple TV.

Downloads cache progressive files, not HLS/DASH segments. tvOS can purge cached files and application caches when storage is needed. Missing downloaded files are reported and can be downloaded again; local storage is not a durable cloud backup. External VTT/SRT subtitles render in the TV player's overlay; picture in picture uses embedded subtitles.

## Development and validation

The root `react-native` dependency aliases `react-native-tvos@0.86.3-0` for both phone and TV. The root override prevents npm from installing a second phone-only runtime through peer dependencies. TV-specific Metro resolution selects `*.tv.tsx` / `*.tv.ts` only for the TV app.

Unsupported document-picker, sharing, and DOM webview modules are excluded from tvOS autolinking. The TV build compiles React Native and Expo modules from source to avoid iOS-only precompiled artifacts. TV media files use the cache directory. `scripts/tv-assets.mjs` generates the committed icon layers and top-shelf images; regenerate with `npm run tvos:assets`.

```sh
npm run check
npm run build:tvos
```

Hermes export checks the TV JavaScript module graph, not native compilation. Local verification includes TypeScript, the provider/library tests, remote event handling, hosted document validation, tvOS project generation, and Hermes export. This workstation has Command Line Tools only, with no usable Xcode/tvOS simulator, so native compilation, Siri Remote focus behavior, and playback on an Apple TV still require device testing. The native CI job has been configured but has not been run from this workspace.
