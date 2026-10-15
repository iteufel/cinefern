import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertManifest,
  assertSource,
  chooseSource,
  mediaKey,
  parseBundle,
  type MediaItem,
  type ProviderManifest,
} from '@cinefern/provider-sdk';
import {
  continueWatching,
  initialState,
  LibraryStore,
  type KeyValueStorage,
} from '../src/core/library';
import { ProviderRuntime } from '../src/core/runtime';
import { DownloadManager } from '../src/core/downloads';
import {
  openFilmsManifest,
  openFilmsProvider,
} from '../src/providers/open-films';
import { parseSubtitles, subtitleAt } from '../src/player/subtitles';
import {
  JELLYFIN_PROVIDER_ID,
  JSON_LIBRARY_PROVIDER_ID,
} from '../src/providers/ids';
import type { PlatformServices } from '../src/platform/types';

function storage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value) {
      values.set(key, value);
    },
    async remove(key) {
      values.delete(key);
    },
  };
}
const item: MediaItem = {
  id: 'one',
  providerId: 'org.example.films',
  type: 'movie',
  title: 'One',
};
const manifest: ProviderManifest = {
  id: 'org.example.films',
  name: 'Example',
  version: '1.0.0',
  apiVersion: 1,
  description: 'Example provider',
  author: 'Tests',
  capabilities: [],
  permissions: { network: ['https://example.com'], storage: true },
};
const transport = async () => ({
  ok: true,
  status: 200,
  headers: {},
  body: '',
});
test('media identities cannot collide across providers or separators', () => {
  assert.notEqual(
    mediaKey(item),
    mediaKey({ ...item, providerId: 'org.other.films' }),
  );
  assert.notEqual(
    mediaKey({ id: 'b:c', providerId: 'a' }),
    mediaKey({ id: 'c', providerId: 'a:b' }),
  );
});
test('watchlist toggles without duplicates and persists', async () => {
  const disk = storage();
  const library = new LibraryStore(disk);
  await library.initialize();
  assert.equal(library.toggleWatchlist(item), true);
  assert.equal(library.toggleWatchlist(item), false);
  library.toggleWatchlist(item);
  await library.flush();
  const restored = new LibraryStore(disk);
  await restored.initialize();
  assert.equal(restored.getSnapshot().watchlist.length, 1);
  assert.equal(restored.isSaved(item), true);
});
test('providers start disabled and only explicit selections survive restart', async () => {
  const disk = storage();
  const library = new LibraryStore(disk);
  await library.initialize();
  assert.deepEqual(library.getSnapshot().enabledProviders, []);
  for (const id of [
    JELLYFIN_PROVIDER_ID,
    JSON_LIBRARY_PROVIDER_ID,
    openFilmsManifest.id,
    'org.example.future-provider',
  ])
    assert.equal(library.isProviderEnabled(id), false);

  library.setProviderEnabled(JELLYFIN_PROVIDER_ID, true);
  await library.flush();
  const restored = new LibraryStore(disk);
  await restored.initialize();
  assert.deepEqual(restored.getSnapshot().enabledProviders, [
    JELLYFIN_PROVIDER_ID,
  ]);
});
test('new provider bundles stay disabled and updates preserve their activation choice', async () => {
  const disk = storage();
  const library = new LibraryStore(disk);
  await library.initialize();
  const bundle = {
    format: 'cinefern-provider' as const,
    manifest,
    code: 'var CinefernProvider = {};',
  };
  library.install(bundle);
  assert.equal(library.isProviderEnabled(manifest.id), false);
  assert.equal(library.getSnapshot().plugins[0]?.enabled, false);

  library.setProviderEnabled(manifest.id, true);
  library.install({ ...bundle, manifest: { ...manifest, version: '2.0.0' } });
  assert.equal(library.isProviderEnabled(manifest.id), true);
  assert.equal(library.getSnapshot().plugins[0]?.enabled, true);

  library.setProviderEnabled(manifest.id, false);
  library.install({ ...bundle, manifest: { ...manifest, version: '3.0.0' } });
  await library.flush();
  const restored = new LibraryStore(disk);
  await restored.initialize();
  assert.equal(restored.isProviderEnabled(manifest.id), false);
  assert.equal(restored.getSnapshot().plugins[0]?.enabled, false);
});
test('legacy automatic providers are disabled without erasing the saved library', async () => {
  const disk = storage();
  const { enabledProviders, ...legacy } = initialState();
  const history = [{ item, position: 20, duration: 100, updatedAt: 1 }];
  await disk.set(
    'cinefern.library.v1',
    JSON.stringify({ ...legacy, disabledProviders: [], history }),
  );
  const library = new LibraryStore(disk);
  await library.initialize();
  assert.deepEqual(library.getSnapshot().enabledProviders, []);
  assert.deepEqual(library.getSnapshot().history, history);
});
test('legacy configured providers migrate without re-enabling disabled choices', async () => {
  const disk = storage();
  const { enabledProviders, ...legacy } = initialState();
  const activeId = 'org.example.active';
  const disabledId = 'org.example.disabled';
  await disk.set(
    'cinefern.library.v1',
    JSON.stringify({
      ...legacy,
      disabledProviders: [JSON_LIBRARY_PROVIDER_ID, disabledId],
      providerSettings: {
        [JELLYFIN_PROVIDER_ID]: {
          userId: 'user',
          serverUrl: 'https://example.com',
        },
        [JSON_LIBRARY_PROVIDER_ID]: {
          catalogUrl: 'https://example.com/catalog.json',
        },
      },
      plugins: [activeId, disabledId].map((id) => ({
        bundle: {
          format: 'cinefern-provider',
          manifest: { ...manifest, id },
          code: 'var CinefernProvider = {};',
        },
        enabled: true,
        installedAt: 1,
        settings: {},
      })),
    }),
  );
  const library = new LibraryStore(disk);
  await library.initialize();
  assert.deepEqual(library.getSnapshot().enabledProviders, [
    JELLYFIN_PROVIDER_ID,
    activeId,
  ]);
  assert.equal(library.getSnapshot().plugins[1]?.enabled, false);
  library.setProviderEnabled(JELLYFIN_PROVIDER_ID, false);
  await library.flush();
  const restored = new LibraryStore(disk);
  await restored.initialize();
  assert.deepEqual(restored.getSnapshot().enabledProviders, [activeId]);
});
test('serialized writes preserve the latest settings', async () => {
  const disk = storage();
  const library = new LibraryStore(disk);
  await library.initialize();
  library.setSettings({ quality: 480 });
  library.setSettings({ quality: 2160 });
  library.toggleWatchlist(item);
  await library.flush();
  const restored = new LibraryStore(disk);
  await restored.initialize();
  assert.equal(restored.getSnapshot().settings.quality, 2160);
  assert.equal(restored.getSnapshot().watchlist.length, 1);
});
test('progress is provider-specific and rejects invalid durations', async () => {
  const library = new LibraryStore(storage());
  await library.initialize();
  library.recordProgress(item, 30, 100);
  library.recordProgress({ ...item, providerId: 'org.other.films' }, 60, 100);
  library.recordProgress(item, NaN, 100);
  library.recordProgress(item, 90, Infinity);
  assert.equal(library.progress(item)?.position, 30);
  assert.equal(library.getSnapshot().history.length, 2);
});
test('continue watching chooses the latest episode per show and omits completed titles', () => {
  const history = [
    {
      item: {
        ...item,
        id: 'episode1',
        type: 'episode' as const,
        showId: 'show',
      },
      position: 40,
      duration: 100,
      updatedAt: 1,
    },
    {
      item: {
        ...item,
        id: 'episode2',
        type: 'episode' as const,
        showId: 'show',
      },
      position: 30,
      duration: 100,
      updatedAt: 2,
    },
    {
      item: { ...item, id: 'completed' },
      position: 99,
      duration: 100,
      updatedAt: 3,
    },
  ];
  assert.deepEqual(
    continueWatching(history).map((h) => h.item.id),
    ['episode2'],
  );
});
test('corrupt storage is reported without breaking startup', async () => {
  const disk = storage();
  await disk.set('cinefern.library.v1', '{bad');
  const library = new LibraryStore(disk);
  await library.initialize();
  assert.equal(library.getSnapshot().ready, true);
  assert.match(library.getSnapshot().persistenceError!, /restore/);
});
test('finishing a newer episode does not revive an older episode in continue watching', () => {
  assert.deepEqual(
    continueWatching([
      {
        item: { ...item, id: 'newer', type: 'episode', showId: 'show' },
        position: 100,
        duration: 100,
        updatedAt: 2,
      },
      {
        item: { ...item, id: 'older', type: 'episode', showId: 'show' },
        position: 40,
        duration: 100,
        updatedAt: 1,
      },
    ]),
    [],
  );
});
test('uninstalling a disabled plugin clears its enablement and settings', async () => {
  const library = new LibraryStore(storage());
  await library.initialize();
  const bundle = {
    format: 'cinefern-provider' as const,
    manifest,
    code: 'var CinefernProvider = {};',
  };
  library.install(bundle);
  library.setProviderEnabled(manifest.id, false);
  library.setProviderSettings(manifest.id, { value: 'old' });
  library.removePlugin(manifest.id);
  library.install(bundle);
  assert.equal(
    library.getSnapshot().enabledProviders.includes(manifest.id),
    false,
  );
  assert.equal(library.getSnapshot().providerSettings[manifest.id], undefined);
});
test('unfinished downloads become retryable after restarting', async () => {
  const disk = storage();
  const library = new LibraryStore(disk);
  await library.initialize();
  library.update({
    downloads: [
      {
        id: 'test',
        item,
        sourceUrl: 'https://example.com/video.mp4',
        status: 'downloading',
        progress: 0.5,
        bytes: 50,
        createdAt: 1,
      },
    ],
  });
  await library.flush();
  const restored = new LibraryStore(disk);
  await restored.initialize();
  assert.equal(restored.getSnapshot().downloads[0]?.status, 'failed');
});
test('manifests reject unknown API versions, reserved ids and unsafe origins', () => {
  assertManifest(manifest);
  assert.throws(
    () => assertManifest({ ...manifest, apiVersion: 2 }),
    /API version/,
  );
  assert.throws(
    () =>
      assertManifest({
        ...manifest,
        permissions: { network: ['https://example.com/path'] },
      }),
    /origins/,
  );
  assert.throws(
    () => assertManifest({ ...manifest, id: 'constructor' }),
    /Provider id/,
  );
  assert.throws(
    () =>
      assertManifest({
        ...manifest,
        settings: [{ id: 'constructor', label: 'bad', type: 'text' }],
      }),
    /setting id/,
  );
});
test('bundle parser rejects old plugins and oversized code', () => {
  assert.throws(() => parseBundle('export default {}'));
  assert.throws(
    () => parseBundle(JSON.stringify({ format: 'old', code: 'x', manifest })),
    /compiled/,
  );
  assert.throws(() => parseBundle('x'.repeat(2_000_001)), /2 MB/);
});
test('sources reject scripts and embedded credentials', () => {
  assertSource({
    id: 'mp4',
    type: 'http',
    label: 'HD',
    url: 'https://example.com/video.mp4',
  });
  assert.throws(
    () =>
      assertSource({
        id: 'a',
        type: 'http',
        label: 'HD',
        url: 'javascript:alert(1)',
      }),
    /HTTP/,
  );
  assert.throws(
    () =>
      assertSource({
        id: 'a',
        type: 'http',
        label: 'HD',
        url: 'https://user:password@example.com',
      }),
    /HTTP/,
  );
});
test('source selection respects audio language and quality ceiling', () => {
  const sources = [
    {
      id: '4k',
      label: '4K',
      url: 'https://example.com/a',
      type: 'http' as const,
      quality: 2160,
      audioLanguage: 'en',
    },
    {
      id: 'hd',
      label: 'HD',
      url: 'https://example.com/b',
      type: 'http' as const,
      quality: 720,
      audioLanguage: 'en',
    },
    {
      id: 'de',
      label: 'Deutsch',
      url: 'https://example.com/c',
      type: 'http' as const,
      quality: 1080,
      audioLanguage: 'de',
    },
  ];
  assert.equal(
    chooseSource(sources, {
      quality: 1080,
      audioLanguage: 'en',
      subtitleLanguage: '',
    })?.id,
    'hd',
  );
  assert.equal(
    chooseSource(sources, {
      quality: 1080,
      audioLanguage: 'de',
      subtitleLanguage: '',
    })?.id,
    'de',
  );
});
test('network permissions are exact and plugin storage is isolated', async () => {
  let requests = 0;
  const runtime = new ProviderRuntime(storage(), async () => {
    requests++;
    return { ok: true, status: 200, body: '{}', headers: {} };
  });
  const context = runtime.context(manifest, {});
  await assert.rejects(
    context.http.request('https://example.com.evil.test/a'),
    /not permitted/,
  );
  await assert.rejects(
    context.http.request('http://example.com/a'),
    /not permitted/,
  );
  await context.http.request('https://example.com/a');
  assert.equal(requests, 1);
  await context.storage.set('token', 'one');
  assert.equal(
    await runtime
      .context({ ...manifest, id: 'org.other.films' }, {})
      .storage.get('token'),
    null,
  );
  assert.equal(await context.storage.get('token'), 'one');
});
test('missing claimed capabilities and spoofed media output are rejected', async () => {
  const runtime = new ProviderRuntime(storage(), transport);
  await assert.rejects(
    runtime.register(
      { ...manifest, capabilities: ['search'] },
      {
        create: () => ({
          async getItem() {
            return item;
          },
        }),
      },
    ),
    /missing search/,
  );
  await runtime.register(manifest, {
    create: () => ({
      async getItem() {
        return { ...item, providerId: 'spoofed' };
      },
    }),
  });
  await assert.rejects(
    runtime.call(manifest.id, 'getItem', ['one']),
    /invalid media/,
  );
});
test('compiled TypeScript bundles execute async host requests in the interpreter', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cinefern-provider-'));
  const output = join(directory, 'example.cfprovider');
  execFileSync(process.execPath, [
    'scripts/build-provider.mjs',
    'providers/example/provider.ts',
    'providers/example/manifest.json',
    output,
  ]);
  const exampleManifest = JSON.parse(
    await readFile('providers/example/manifest.json', 'utf8'),
  );
  const runtime = new ProviderRuntime(storage(), async () => ({
    ok: true,
    status: 200,
    headers: {},
    body: JSON.stringify({
      items: [
        {
          ...item,
          title: 'Test Film',
          sources: [
            {
              id: 'hd',
              label: 'HD',
              type: 'http',
              url: 'https://example.com/film.mp4',
            },
          ],
        },
      ],
    }),
  }));
  await runtime.install(parseBundle(await readFile(output, 'utf8')));
  await rm(directory, { recursive: true });
  const media = await runtime.call<MediaItem>(exampleManifest.id, 'getItem', [
    'one',
  ]);
  assert.equal(media.title, 'Test Film');
  assert.equal(media.providerId, exampleManifest.id);
  const home = await runtime.call<{ featured: MediaItem[] }>(
    exampleManifest.id,
    'getHome',
  );
  assert.equal(home.featured.length, 1);
});
test('interpreter cannot read host globals and enforces its execution quota', async () => {
  const runtime = new ProviderRuntime(storage(), transport);
  await assert.rejects(
    runtime.install({
      format: 'cinefern-provider',
      manifest,
      code: 'var CinefernProvider = { create() { return process.env; } };',
    }),
  );
  await assert.rejects(
    runtime.install({
      format: 'cinefern-provider',
      manifest,
      code: 'while (true) {}',
    }),
    /quota|Quota|ticks|limit/i,
  );
});
test('open cinema covers browsing, episodes, sources and collections', async () => {
  const runtime = new ProviderRuntime(storage(), transport);
  await runtime.register(openFilmsManifest, openFilmsProvider);
  const home = await runtime.call<{ featured: MediaItem[] }>(
    openFilmsManifest.id,
    'getHome',
  );
  assert.ok(home.featured.length);
  const episodes = await runtime.call<MediaItem[]>(
    openFilmsManifest.id,
    'getEpisodes',
    ['open-film-anthology', 'classics'],
  );
  assert.equal(episodes.length, 2);
  assert.equal(episodes[0]?.type, 'episode');
  const sources = await runtime.call<unknown[]>(
    openFilmsManifest.id,
    'getSources',
    [episodes[0]!.id],
  );
  assert.ok(sources.length);
});
test('downloads persist a local URI and reject manifest downloads', async () => {
  const library = new LibraryStore(storage());
  await library.initialize();
  const host: Pick<PlatformServices, 'download'> = {
    async download(_request, progress) {
      progress({ bytes: 100, totalBytes: 100 });
      progress({ bytes: 1000, totalBytes: 1000 });
      return 'file:///video.mp4';
    },
  };
  const manager = new DownloadManager(library, host as PlatformServices);
  await manager.add(item, {
    id: 'hd',
    label: 'HD',
    type: 'http',
    url: 'https://example.com/film.mp4',
    downloadable: true,
  });
  assert.equal(library.getSnapshot().downloads[0]?.status, 'complete');
  assert.equal(
    library.getSnapshot().downloads[0]?.localUri,
    'file:///video.mp4',
  );
  assert.equal(library.getSnapshot().downloads[0]?.bytes, 1000);
  await assert.rejects(
    manager.add(item, {
      id: 'hls',
      label: 'HLS',
      type: 'hls',
      url: 'https://example.com/a.m3u8',
      downloadable: true,
    }),
    /file downloads/,
  );
});
test('VTT and SRT subtitles parse and respect cue boundaries', () => {
  const vtt = parseSubtitles(
    'WEBVTT\n\n00:00:01.000 --> 00:00:02.500\n<b>Hello</b> &amp; goodbye\n\n',
  );
  assert.equal(subtitleAt(vtt, 1.5), 'Hello & goodbye');
  assert.equal(subtitleAt(vtt, 2.5), '');
  assert.equal(
    subtitleAt(
      parseSubtitles('1\n00:00:03,000 --> 00:00:05,000\nHello\nworld'),
      4,
    ),
    'Hello\nworld',
  );
});
