# Connect to Jellyfin

Jellyfin is included with Cinefern on Windows, macOS, Linux, iOS, Android, and Apple TV.
You need an existing Jellyfin server and an account on it.

1. Open **Providers → Jellyfin → Connect**.
2. Enter the server URL, such as `http://192.168.1.20:8096` or `https://media.example.com/jellyfin`.
3. Enter your Jellyfin username and password, then choose **Connect to Jellyfin**.
4. Select **Jellyfin** in navigation, or use Discover and Search to browse it alongside your other providers.

Include a reverse proxy's base path, but omit `/web/index.html`, query strings, and fragments.
An Apple TV or phone must be able to reach the server itself; `localhost` refers to that device.
Use HTTPS outside your local network. Standard certificate verification remains enabled.
The native builds permit user-selected HTTP media servers and request local-network access on Apple devices.
Web previews also require the server/proxy to allow CORS and a scheme compatible with the page's mixed-content rules.

## Supported media

- Movie and TV libraries, box sets, recent additions, and paginated browsing/search.
- Movie/show details, artwork, people and credits, recommendations, seasons, and episode queues.
- Cinefern watchlists, watch history, and local resume positions.
- Compatible H.264 MP4 files through Jellyfin's authenticated streaming endpoint.
- Jellyfin-negotiated HLS for remuxing/transcoding, preferred audio language, quality limits, and text subtitles delivered as WebVTT.

The common playback profile uses H.264 video and AAC audio so the same provider can serve all platforms.
Allow playback and transcoding for the Jellyfin user when the original media does not fit that profile.
The server does the conversion; performance depends on its transcoding setup.
Audio changes that require selecting a different default track request a server remux.

This provider currently streams video libraries. Music, live TV, Quick Connect/SSO, and Jellyfin offline downloads
are not implemented. Watchlists and playback progress remain local to Cinefern and do not update Jellyfin favorites
or watched status. Bitmap subtitles are not exposed as external text tracks.

## Manage the connection

Use **Providers → Jellyfin → Settings** to sign in again or disconnect. One Jellyfin server/account is active per device.
Disabling the provider hides it without discarding the saved connection. Disconnect removes the local session and
attempts to revoke it on the server; local sign-out still succeeds when the server is offline.
If access expires or is revoked, sign in again. A failed sign-in leaves the previous connection intact.

Passwords are used only during authentication and are never saved. Server-issued tokens are separate from library
settings and library exports. Native apps use SecureStore; desktop uses Electron safeStorage and requires an available
system keyring. The browser preview uses browser storage. Resetting Cinefern clears its stored session.
Image metadata and library backups contain no authentication tokens. Playback URLs carry the server token only while
playing, so this provider does not offer authenticated streams as persistent download entries.

## Implementation and verification

The TypeScript provider uses the existing provider SDK and HTTP transport. Saving a connection grants access only to
the configured server's exact origin. Playback URLs returned by the server are checked before adding credentials.
It uses Jellyfin's [official API specification](https://api.jellyfin.org/) and
[authentication contract](https://kotlin-sdk.jellyfin.org/guide/authentication.html).

`npm run check` covers authentication, persistence, failed reconnects, disconnection/reset, server base paths,
library pagination, series, playback profiles, audio selection, subtitles, and credential boundaries using API fixtures.
Real-server codec/transcoding behavior and native device playback still require verification against your server and devices.
