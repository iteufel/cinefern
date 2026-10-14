# Cinefern

Your cinema. Everywhere.

An open-source media player rebuilt with React Native and TypeScript.
Native Expo apps target iOS, Android, and Apple TV (tvOS). Electron packages the shared React Native Web interface for Windows, macOS, and Linux.
The web target also provides a convenient development preview.

Cinefern is the modern successor to [NWPlay](https://github.com/nwplay/NWPlay),
with a new identity and a TypeScript provider system. Its source lives in
[iteufel/cinefern](https://github.com/iteufel/cinefern).

## Features

- Provider home feeds, featured titles, collections, recommendations, and search across providers.
- Movies, series, seasons, episodes, cast/creator pages, trailers, and source selection.
- Watchlist filters, new-episode checks, watch history, continue watching, and saved playback progress.
- HTTP files, HLS, and DASH with platform-specific players; episode queues and autoplay.
- Fullscreen, picture in picture, audio/subtitle selection, playback speed, media keys, and desktop shortcuts.
- Real file downloads, offline playback, cancellation, retry, and removal.
- A new TypeScript provider SDK, installable bundles, settings, lifecycle hooks, and ordered stream resolvers.
- Responsive desktop/tablet/phone layouts, English/German navigation, data import/export, and appearance preferences.
- Included Jellyfin, Open Cinema, and JSON library providers.
- Provider media agents backed by Deep Agents JS, with OpenAI/xAI/OpenRouter keys, web search, and browser tools.
- Apple TV interface with Siri Remote focus/navigation, fullscreen playback, and provider installation by URL.

## Run

Use Node.js 22.13 or newer and npm.

```sh
npm ci
npm run web       # browser preview at http://localhost:8081
npm run desktop   # Electron + the Expo development server
```

Mobile development requires the platform toolchain:

```sh
npm run ios       # macOS, compatible Xcode, CocoaPods, and an iOS simulator/device
npm run android   # Android SDK and a compatible JDK
```

Expo generates native projects from `app.json`; generated `ios/` and `android/` are ignored.
Run `npm run native:generate -- --no-install` to generate them without installing native dependencies.
SDK 57 currently requires Xcode 26.4+ for iOS builds. The [Expo compatibility table](https://docs.expo.dev/versions/latest/) is the source for toolchain requirements.

Apple TV has a separate native project under `apps/tv`, sharing the same screens, library, and TypeScript providers:

```sh
npm run tvos:generate  # generate apps/tv/ios for tvOS 16.4+
npm run tvos -- --device  # choose an Apple TV simulator or paired device
```

Requires a compatible full Xcode installation, CocoaPods, and the tvOS SDK/simulator runtime.
See [the Apple TV guide](docs/apple-tv.md) for remote controls, provider setup, builds, and platform limits.

## Build

```sh
npm run check           # TypeScript and core/integration tests
npm run build           # static web renderer in dist/
npm run build:mobile    # iOS and Android Hermes bundles in dist-mobile/
npm run build:tvos      # Apple TV Hermes bundle in dist-tvos/
npm run desktop:pack    # unsigned/unpacked desktop app in release/
npm run desktop:dist    # installers for the current host
```

Build desktop installers on their matching operating systems:

```sh
npm run desktop:dist -- --mac
npm run desktop:dist -- --win
npm run desktop:dist -- --linux
```

Windows uses NSIS, macOS uses DMG, and Linux uses AppImage/deb.
macOS and Windows support x64/arm64 package targets; use `--x64` or `--arm64` to select an architecture.
Release signing/notarization credentials are supplied through electron-builder's environment.
The CI workflow builds unsigned desktop installers on all three hosts and exports both mobile bundles.
A manual workflow run also compiles an Android debug APK, an unsigned iOS simulator application, and an Apple TV simulator application.

Mobile JS export is a bundle check, not an APK/IPA. Build native binaries with the local toolchain or your Expo EAS account:

```sh
npx eas-cli build --platform all --profile production
```

`eas.json` also includes development and preview profiles. Physical iOS distribution and store releases require your own signing credentials.

## Providers

**Jellyfin is included by default.** Open **Providers → Jellyfin → Connect**, enter your server URL,
username, and password, then choose **Connect to Jellyfin**. Your movies, shows, seasons, and episodes
appear in the library feeds and search on desktop, mobile, and Apple TV.
See [Jellyfin setup](docs/jellyfin.md) for server URLs, playback, and connection management.

Providers are written in TypeScript against [@cinefern/provider-sdk](packages/provider-sdk/src/index.ts).
Build the included example:

```sh
npm run plugin:example
```

Then use **Providers → Install provider** to choose the generated `.cfprovider` file.
On Apple TV, enter the URL of a hosted bundle and review its permissions before installation.
Edit the example's manifest origins and catalog URL to connect your own server.
See [the provider guide](docs/providers.md) for capabilities, pagination, lifecycle, settings, and media sources.

**Media agent:** add your API keys and model in **Settings → Media agent**, enable the tools, and grant
access to individual providers. Plugins call `context.agent.search` and `context.agent.resolve` without
receiving your keys. Build `npm run plugin:agent-example` for a working research provider.
See [the media agent guide](docs/media-agent.md) for usage, browser differences, limits, and verification.

**Your Library** accepts a JSON catalog matching [the example format](providers/example/catalog.json).
Set its catalog URL in Providers; saving grants this included provider access to that origin.
For series and custom API integrations, write a provider with the season/episode methods.

## Platform notes

HLS or a supported HTTP file is the portable playback choice. iOS/tvOS AVPlayer does not support DASH, so providers must offer an alternative.
Downloads require progressive file sources; adaptive manifests, live streams, and DRM are not saved as offline files.
Web previews require CORS-enabled servers for catalog requests, subtitles, adaptive streams, and downloads.
Browser downloads use IndexedDB and are subject to browser storage limits.
Episode checks are manual/in-app; there is no background push service.
English/German localizes navigation and primary media actions; provider labels and supplemental copy use their supplied language.

This rewrite intentionally removes old NW.js plugin and storage compatibility.
See [architecture](docs/architecture.md) and [feature coverage](docs/features.md) for implementation details and limits.

## License

Code: [AGPL-3.0-or-later](LICENSE). Film artwork: [individual Creative Commons credits](assets/ATTRIBUTION.md).
Open films retain their original credits and licensing. Cinefern is not affiliated with the filmmakers or media providers.
