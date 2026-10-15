# Feature coverage

The original source was used as the feature inventory. Compatibility with its runtime, data format, and plugins is intentionally removed.

| Original workflow               | Cinefern 5 implementation                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Setup and welcome               | Responsive onboarding with language choice and persistent completion                                       |
| Provider home / featured media  | Provider-specific and combined feeds; movie/series filters                                                 |
| Search                          | Debounced concurrent search, provider/type filters, pagination, partial failure handling                   |
| Movie details                   | Metadata, artwork, source selection, cast, previews, related titles                                        |
| TV show / season / episode      | Seasons, episode lists, ordered playback queue, previous/next and autoplay                                 |
| Collections                     | Detail screen, provider sorting, paginated contents                                                        |
| People                          | Creator/cast page and credits when supported by the provider                                               |
| Watchlist                       | Persistent bookmarks, provider/type filters, sorting, optional external watchlist hooks                    |
| Episode notifications           | Baseline episode tracking, manual update check, in-app new-episode badges                                  |
| Watch history                   | Composite provider/media keys, saved positions, continue watching, clear history                           |
| HTTP / HLS / DASH               | HTML video + hls.js/dash.js on desktop; expo-video on mobile; iOS uses HLS/files                           |
| Playback settings               | Quality, audio/subtitle language, autoplay, resume, trailer autoplay/crop, mouse-wheel volume              |
| Player controls                 | Native controls, keyboard shortcuts on desktop, playback speed, audio/text tracks                          |
| Fullscreen / picture in picture | Browser/native platform controls                                                                           |
| System media keys               | Browser Media Session and native now-playing controls                                                      |
| Always on top                   | Electron IPC window control                                                                                |
| AirPlay                         | Native iOS route picker when the OS supports external playback                                             |
| Plugins                         | New TypeScript API, compiled bundles, manifest checks, review/install/enable/disable/remove                |
| Provider settings               | Typed text/password/number/select/boolean controls and hot reconfiguration                                 |
| Extractors / favorites          | Provider resolve capability with persisted priority order                                                  |
| Extensions                      | Optional media-open/watchlist hooks and external watchlist import                                          |
| Language / appearance           | English/German navigation, detail page/dialog preference, soft effects setting                             |
| Cache / reset                   | Provider result cache clearing and library reset                                                           |
| Downloads placeholder           | Working progressive downloads, cancellation, retry, removal, offline playback                              |
| Data portability                | New-format watchlist/history JSON export/import                                                            |
| Desktop packaging               | Electron targets for Windows, macOS, Linux; x64/arm64 configuration                                        |
| Mobile platform scaffolding     | Native Expo configuration, EAS profiles, native generation, both Hermes bundles                            |
| Apple TV                        | Separate tvOS target, remote focus/navigation/player, URL provider installation, icon layers and top shelf |

Old strings for Chromecast and UPnP/DLNA did not have an implementation in the original app; no cast/discovery backend
has been invented in this rewrite. The old Dropbox setting was unused and had no sync implementation.
The original person page and download screen were incomplete; Cinefern 5 implements their supported workflows.

## Limits to verify before releasing

- Native iOS, Android, and tvOS binaries need their respective SDKs and device testing; JavaScript/Hermes export is not a native runtime test.
- Signed installers/store releases require your release accounts and signing credentials.
- iOS/tvOS AVPlayer cannot play DASH-only providers. Provide an HLS/file source.
- Downloads save progressive files, not HLS/DASH segment sets. Retry starts over.
- Apple TV downloads are purgeable caches. It installs provider bundles and imports library backups by URL; file export and external browser links are unavailable. See [Apple TV](apple-tv.md).
- Third-party provider availability, media codecs, credentials, CORS, and source URLs are provider-dependent.
- Sidecar subtitles render in the native in-app player; native system fullscreen uses embedded tracks.
- Episode notifications are in-app checks, not background scheduled/push notifications.
- Localization covers app navigation and principal media actions; supplemental copy and provider-supplied metadata remain in their original language.
