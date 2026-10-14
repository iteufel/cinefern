# Writing a TypeScript provider

The v1 provider API is new. NW.js plugins, extractors, and Angular extensions are not compatible.
Providers compile to a single JSON file ending in `.cfprovider`; the same file runs on desktop, Android, iOS, and Apple TV.

Jellyfin is a built-in TypeScript provider using this API, with a host-managed sign-in flow and per-server network access.
See [Jellyfin setup](jellyfin.md) and [its implementation](../src/providers/jellyfin.ts).

## Start from the example

Copy `providers/example`, change its manifest id and network origins, and implement the methods you need.
Build and install it:

```sh
npm run plugin:build -- providers/example/provider.ts providers/example/manifest.json
```

The output is `dist-providers/org.example.catalog.cfprovider`. In Cinefern, open **Providers → Install provider**,
choose the file, review the manifest, and install. Provider settings are editable without restarting the app.
Reinstalling the same id replaces the implementation and keeps its settings.
Apple TV installs the same bundle from a hosted URL, followed by the same manifest review. Other targets also offer **Install from URL**. See [Apple TV setup](apple-tv.md).

```ts
import { defineProvider } from '@cinefern/provider-sdk';

export default defineProvider({
  create(context) {
    return {
      async getItem(id) {
        const response = await context.http.request('https://my-server.example/media/' + encodeURIComponent(id));
        if (!response.ok) throw new Error('Server returned ' + response.status);
        return { ...JSON.parse(response.body), providerId: 'org.example.media' };
      },
    };
  },
});
```

The manifest for this example must declare `https://my-server.example` as a network origin.
Every media item must have an id, providerId matching the manifest, type, and title.
Types are `movie`, `series`, `episode`, `collection`, and `person`.
Provider ids must be stable and unique.

## Manifest

```json
{
  "id": "org.example.media",
  "name": "My media",
  "version": "1.0.0",
  "apiVersion": 1,
  "description": "A provider for my media server",
  "author": "Your name",
  "capabilities": ["browse", "search", "sources"],
  "permissions": {
    "network": ["https://my-server.example", "https://my-cdn.example"],
    "storage": true
  },
  "settings": [{ "id": "token", "label": "API token", "type": "password", "default": "" }]
}
```

Origins are exact: schemes and ports count; paths and wildcards are not allowed. Use HTTPS for public servers.
An HTTP origin may be declared for a local development server. Bundles are limited to 2 MB.
The manifest's API version and claimed capabilities are checked on registration.

## Capabilities

| Capability  | Required methods        |
| ----------- | ----------------------- |
| browse      | getHome                 |
| search      | search                  |
| sources     | getSources              |
| collections | getCollection           |
| series      | getSeasons, getEpisodes |
| trailers    | getTrailer              |
| people      | getPerson               |
| resolve     | resolve                 |
| watchlist   | getWatchlist            |

`getItem` is always required. Optional `initialize` and `dispose` handle lifecycle work.
`getSuggestions`, `onMediaOpened`, and `onWatchlistChanged` support recommendations and media/watchlist extensions.
Full types and documentation are in [the SDK](../packages/provider-sdk/src/index.ts).

Home feeds contain featured media and collections with embedded items.
Search and collection pages return `nextCursor`; pass the cursor back unchanged to fetch the next page.
Episode ids must be unique inside a provider. Include `showId`, `season`, and `episode` for correct history grouping.
`getSources` can use the preferred quality, audio language, and subtitle language to select versions.

```ts
{
  id: 'english-hd',
  url: 'https://my-cdn.example/film.m3u8',
  type: 'hls',
  label: 'English · 1080p',
  quality: 1080,
  audioLanguage: 'en',
  subtitles: [
    { id: 'en', label: 'English', language: 'en', url: 'https://my-cdn.example/film.vtt' },
  ],
}
```

Prefer adaptive HLS for a source that works everywhere. Android and desktop also support DASH.
iOS/tvOS AVPlayer requires HLS or a supported file format; offer an alternative to DASH.
Mark a progressive HTTP source as `downloadable: true` to support offline downloads.
HLS/DASH manifests and live sources are not saved as standalone files.
DRM is not part of API v1.

The web preview needs signed URLs for protected HTTP files, because HTML video cannot send arbitrary headers.
Desktop forwards protected file requests through an ephemeral local-protocol proxy, including range requests.
HLS/DASH adapters and native players accept source headers. Browser providers must use servers that allow CORS for
catalog requests, adaptive streaming, subtitles, and downloads.

## Runtime

The build tool bundles TypeScript and static imports with esbuild, then normalizes object methods and reserved property
names for the interpreter. Async functions, closures, and JSON catalogs are covered by integration tests.
Providers execute in SandboxJS, with an execution quota and request timeout. They receive only the SDK context:

- `context.http.request` returns a plain response with status, ok, headers, and body.
- `context.agent` exposes host-managed media search and data resolution, with explicit user grants and no API key access. See [media agent setup and provider API](media-agent.md).
- `context.storage` stores strings under a separate provider namespace.
- `context.settings` contains declared defaults and the user's configured values.
- `context.log` writes a provider-prefixed diagnostic.

Do not use Node.js, React Native modules, DOM APIs, global fetch, dynamic imports, or native dependencies.
Use the SDK HTTP transport instead of returning Response objects.
SandboxJS is an interpreted JavaScript subset; not every npm package will work unchanged.
Install providers from authors you trust. The interpreter reduces access but is not an audited hostile-code boundary.
Keep provider requests bounded and avoid background loops. Rebuild and reinstall a bundle to update it.

This repository implements local bundle installation and does not operate a public plugin marketplace.

For a provider using the media agent, build `npm run plugin:agent-example` and install the resulting
Media Research bundle. It demonstrates both `context.agent.search` and `context.agent.resolve`.
