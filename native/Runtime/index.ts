import { nativeCall } from './polyfills';
import { parseSubtitles } from '../../src/player/subtitles';
import {
  parseBundle,
  chooseSource,
  mediaKey,
  assertSource,
  assertMediaItem,
  type MediaItem,
  type MediaSource,
} from '../../packages/provider-sdk/src';
import { ProviderRuntime } from '../../src/core/runtime';
import { LibraryStore, continueWatching } from '../../src/core/library';
import { JellyfinConnection } from '../../src/core/jellyfin-connection';
import { DownloadManager } from '../../src/core/downloads';
import {
  jellyfinManifest,
  jellyfinProvider,
  jellyfinConfiguredManifest,
} from '../../src/providers/jellyfin';
import {
  jsonLibraryManifest,
  jsonLibraryProvider,
} from '../../src/providers/json-library';
import { MediaAgentService } from '../../src/agent/service';
import { portableAgentPlatform } from '../../src/agent/transport';
import {
  agentGrant,
  readAgentSettings,
  saveAgentSettings,
  saveAgentKey,
  agentKeyStatus,
  revokeAgentGrant,
} from '../../src/agent/settings';
import { fetchTextDocument } from '../../src/core/import-document';

const storage = {
  get: (key: string) => nativeCall('storage.get', { key }),
  set: (key: string, value: string) =>
    nativeCall('storage.set', { key, value }),
  remove: (key: string) => nativeCall('storage.remove', { key }),
  keys: () => nativeCall('storage.keys'),
};
const request = (url: string, options = {}) =>
  nativeCall('http', { url: new URL(url).href, options });
const fetcher: typeof fetch = async (resource, options) => {
  const url =
    typeof resource === 'string'
      ? resource
      : resource instanceof URL
        ? resource.href
        : resource.url;
  if (options?.signal?.aborted) throw new Error('Request cancelled.');
  const token = crypto.randomUUID();
  const abort = () => void nativeCall('http.cancel', { token });
  options?.signal?.addEventListener('abort', abort, { once: true });
  try {
    const result = await nativeCall('http', {
      token,
      url,
      limit: 1_000_000,
      options: {
        method: options?.method,
        headers: Object.fromEntries(new Headers(options?.headers).entries()),
        body: options?.body,
      },
    });
    if (options?.signal?.aborted) throw new Error('Request cancelled.');
    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    });
  } finally {
    options?.signal?.removeEventListener('abort', abort);
  }
};
Object.assign(globalThis, { fetch: fetcher });
const library = new LibraryStore(storage);
const agent = new MediaAgentService(storage, portableAgentPlatform(fetcher));
const runtime = new ProviderRuntime(storage, request, agent);
const jellyfin = new JellyfinConnection(storage, request);
const downloads = new DownloadManager(library, {
  download: async (input: any, progress: any, signal: AbortSignal) => {
    const abort = () => void nativeCall('download.cancel', { id: input.id });
    signal.addEventListener('abort', abort, { once: true });
    try {
      const result = await nativeCall('download', input);
      progress({ bytes: result.bytes, totalBytes: result.bytes });
      return result.uri;
    } finally {
      signal.removeEventListener('abort', abort);
    }
  },
  removeDownload: (uri: string) => nativeCall('download.remove', { uri }),
} as any);
const builtinManifests = [jellyfinManifest, jsonLibraryManifest];
let configuration: Promise<unknown> = Promise.resolve();
function configure() {
  configuration = configuration
    .catch(() => {})
    .then(async () => {
      const state = library.getSnapshot();
      agent.cancel();
      for (const record of runtime.all())
        await runtime.remove(record.manifest.id);
      if (state.enabledProviders.includes(jellyfinManifest.id)) {
        const settings = await jellyfin.restore(
          state.providerSettings[jellyfinManifest.id] ?? {},
        );
        await runtime.register(
          jellyfinConfiguredManifest(settings),
          jellyfinProvider,
          settings,
        );
      }
      if (state.enabledProviders.includes(jsonLibraryManifest.id)) {
        const settings = state.providerSettings[jsonLibraryManifest.id] ?? {};
        const origins = settings.catalogUrl
          ? [new URL(String(settings.catalogUrl)).origin]
          : [];
        await runtime.register(
          {
            ...jsonLibraryManifest,
            permissions: {
              ...jsonLibraryManifest.permissions,
              network: origins,
            },
          },
          jsonLibraryProvider,
          settings,
        );
      }
      for (const plugin of state.plugins.filter((p) => p.enabled))
        await runtime.install(plugin.bundle, plugin.settings);
    });
  return configuration;
}
function visible(items: MediaItem[]) {
  return items.filter(
    (i) => library.getSnapshot().settings.showAdult || !i.adult,
  );
}
async function sources(
  item: MediaItem,
  preferences: any,
  trailer = false,
): Promise<MediaSource[]> {
  let result: MediaSource[];
  if (item.providerId === 'direct') {
    result = [
      {
        id: 'direct',
        label: 'Direct stream',
        url: item.id,
        type: /\.mpd(?:[?#]|$)/i.test(item.id)
          ? 'dash'
          : /\.m3u8(?:[?#]|$)/i.test(item.id)
            ? 'hls'
            : 'http',
      },
    ];
    result.forEach(assertSource);
  } else if (trailer) {
    const source = await runtime.call<MediaSource | null>(
      item.providerId,
      'getTrailer',
      [item.id],
    );
    result = source ? [source] : [];
  } else
    result = await runtime.call(item.providerId, 'getSources', [
      item.id,
      preferences,
    ]);
  const order = library.getSnapshot().resolverOrder;
  const resolvers = runtime
    .all()
    .filter((p) => p.manifest.capabilities.includes('resolve'))
    .sort((a, b) => {
      const rank = (id: string) => {
        const index = order.indexOf(id);
        return index < 0 ? 999 : index;
      };
      return rank(a.manifest.id) - rank(b.manifest.id);
    });
  for (let i = 0; i < result.length; i++) {
    if (item.providerId !== 'direct' && !result[i]!.resolverId) continue;
    for (const record of resolvers) {
      if (result[i]!.resolverId && result[i]!.resolverId !== record.manifest.id)
        continue;
      try {
        const resolved = await runtime.call<MediaSource | null>(
          record.manifest.id,
          'resolve',
          [result[i]!.url],
        );
        if (resolved) {
          result[i] = resolved;
          break;
        }
      } catch (error) {
        if (result[i]!.resolverId) throw error;
      }
    }
  }
  return result;
}
async function episodeSnapshot(item: MediaItem): Promise<MediaItem[]> {
  const seasons = await runtime.call<any[]>(item.providerId, 'getSeasons', [
    item.id,
  ]);
  return (
    await Promise.all(
      seasons.map((s) =>
        runtime.call<MediaItem[]>(item.providerId, 'getEpisodes', [
          item.id,
          s.id,
        ]),
      ),
    )
  ).flat();
}
async function snapshot() {
  await library.flush();
  const state = library.getSnapshot();
  return {
    state,
    continueWatching: continueWatching(state.history),
    providers: [
      ...builtinManifests,
      ...state.plugins.map((p) => p.bundle.manifest),
    ],
    errors: runtime
      .all()
      .filter((p) => p.error)
      .map((p) => ({ id: p.manifest.id, error: p.error })),
    agent: await readAgentSettings(storage),
    agentKeys: await agentKeyStatus(storage),
  };
}
async function dispatch(op: string, value: any): Promise<any> {
  switch (op) {
    case 'boot':
      await library.initialize();
      await configure();
      return snapshot();
    case 'snapshot':
      return snapshot();
    case 'subtitles': {
      const headers =
        value.sourceURL &&
        new URL(value.url).origin === new URL(value.sourceURL).origin
          ? (value.headers ?? {})
          : {};
      const response = await request(value.url, { headers });
      if (!response.ok) throw new Error('Subtitle request failed.');
      return parseSubtitles(response.body);
    }
    case 'home': {
      const results = await Promise.all(
        runtime
          .all()
          .filter((p) => p.manifest.capabilities.includes('browse'))
          .map(async (p) => {
            try {
              const home = await runtime.call<any>(
                p.manifest.id,
                'getHome',
                [],
                true,
              );
              return {
                ...home,
                featured: visible(home.featured),
                collections: home.collections.map((c: any) => ({
                  ...c,
                  items: visible(c.items),
                })),
                name: p.manifest.name,
                providerId: p.manifest.id,
              };
            } catch (e) {
              return {
                providerId: p.manifest.id,
                name: p.manifest.name,
                error: String(e),
              };
            }
          }),
      );
      return results;
    }
    case 'search':
      return Promise.all(
        runtime
          .all()
          .filter(
            (p) =>
              p.manifest.capabilities.includes('search') &&
              (!value.providerId || p.manifest.id === value.providerId),
          )
          .map(async (p) => {
            try {
              const page = await runtime.call<any>(p.manifest.id, 'search', [
                {
                  query: value.query,
                  limit: 40,
                  cursor: value.cursors?.[p.manifest.id],
                  type: value.type || undefined,
                },
              ]);
              return {
                ...page,
                items: visible(page.items),
                providerId: p.manifest.id,
              };
            } catch (e) {
              return { items: [], providerId: p.manifest.id, error: String(e) };
            }
          }),
      );
    case 'call':
      return runtime.call(
        value.providerId,
        value.method,
        value.args ?? [],
        value.cached ?? false,
      );
    case 'opened':
      if (runtime.get(value.providerId).provider.onMediaOpened)
        await runtime.call(value.providerId, 'onMediaOpened', [value]);
      return null;
    case 'play': {
      const settings = {
        ...library.getSnapshot().settings,
        ...value.preferences,
      };
      const offline = library
        .getSnapshot()
        .downloads.find(
          (d) =>
            mediaKey(d.item) === mediaKey(value.item) &&
            d.status === 'complete',
        );
      const available: MediaSource[] =
        offline?.localUri && !value.trailer
          ? [
              {
                id: 'offline',
                label: 'Downloaded',
                type: 'http',
                url: await nativeCall('download.local', {
                  uri: offline.localUri,
                }),
              },
            ]
          : await sources(value.item, settings, value.trailer);
      // The native media relay supplies arbitrary source headers through public HTTP APIs.
      const playable =
        value.engine === 'vlc'
          ? available
          : available.filter((s) => s.type !== 'dash');
      const source = chooseSource(playable, settings);
      if (!source)
        throw new Error('No compatible source. Choose VLC for DASH media.');
      const history = library.progress(value.item);
      return {
        sources: playable,
        source,
        startAt:
          !value.trailer &&
          settings.resume &&
          history &&
          history.position / history.duration < 0.925
            ? history.position
            : 0,
      };
    }
    case 'progress':
      library.recordProgress(value.item, value.position, value.duration);
      return snapshot();
    case 'save': {
      const saved = library.toggleWatchlist(value);
      const record = runtime
        .all()
        .find((p) => p.manifest.id === value.providerId);
      if (record?.provider.onWatchlistChanged)
        await runtime.call(value.providerId, 'onWatchlistChanged', [
          value,
          saved,
        ]);
      return snapshot();
    }
    case 'settings':
      library.setSettings(value);
      return snapshot();
    case 'setup':
      library.update({ setupComplete: true });
      return snapshot();
    case 'clearHistory':
      library.update({ history: [] });
      return snapshot();
    case 'clearCache':
      runtime.clearCache();
      return snapshot();
    case 'review':
      return parseBundle(value.text).manifest;
    case 'document':
      return fetchTextDocument(value.url, request);
    case 'install': {
      const bundle = parseBundle(value.text);
      if (builtinManifests.some((m) => m.id === bundle.manifest.id))
        throw new Error('A plugin cannot replace a built-in provider.');
      await revokeAgentGrant(storage, bundle.manifest.id);
      library.install(bundle);
      await configure();
      return snapshot();
    }
    case 'enable':
      library.setProviderEnabled(value.id, value.enabled);
      await configure();
      return snapshot();
    case 'providerSettings': {
      const settings =
        value.id === jellyfinManifest.id
          ? await jellyfin.connect(value.settings)
          : value.settings;
      library.setProviderSettings(value.id, settings);
      await configure();
      return snapshot();
    }
    case 'disconnectJellyfin':
      await jellyfin.disconnect();
      library.setProviderSettings(jellyfinManifest.id, {});
      library.setProviderEnabled(jellyfinManifest.id, false);
      await configure();
      return snapshot();
    case 'uninstall':
      await runtime.remove(value.id);
      await revokeAgentGrant(storage, value.id);
      library.removePlugin(value.id);
      await configure();
      return snapshot();
    case 'resolverOrder':
      library.update({ resolverOrder: value });
      return snapshot();
    case 'importWatchlist': {
      const items = await runtime.call<MediaItem[]>(value.id, 'getWatchlist');
      for (const item of items)
        if (!library.isSaved(item)) library.toggleWatchlist(item);
      return snapshot();
    }
    case 'notify': {
      const entry = library
        .getSnapshot()
        .watchlist.find((e) => mediaKey(e.item) === mediaKey(value));
      if (entry)
        library.updateWatchlist(value, {
          notify: !entry.notify,
          knownEpisodes: entry.notify
            ? []
            : (await episodeSnapshot(value)).map((e) => e.id),
          newEpisodes: [],
        });
      return snapshot();
    }
    case 'checkUpdates': {
      for (const entry of library
        .getSnapshot()
        .watchlist.filter((e) => e.notify)) {
        const episodes = await episodeSnapshot(entry.item);
        library.updateWatchlist(entry.item, {
          knownEpisodes: episodes.map((e) => e.id),
          newEpisodes: episodes.filter(
            (e) => !entry.knownEpisodes.includes(e.id),
          ),
        });
      }
      return snapshot();
    }
    case 'agentSettings':
      agent.cancel();
      await saveAgentSettings(storage, value);
      return snapshot();
    case 'agentKey':
      agent.cancel();
      await saveAgentKey(storage, value.backend, value.key);
      return snapshot();
    case 'agentGrant': {
      agent.cancel(value.id);
      const manifest = [
        ...builtinManifests,
        ...library.getSnapshot().plugins.map((p) => p.bundle.manifest),
      ].find((m) => m.id === value.id);
      if (!manifest || manifest.permissions.agent === undefined)
        throw new Error('No agent declaration.');
      const settings = await readAgentSettings(storage);
      settings.grants = settings.grants.filter(
        (g) => !g.startsWith(value.id + '@'),
      );
      if (value.allowed) settings.grants.push(agentGrant(manifest));
      await saveAgentSettings(storage, settings);
      return snapshot();
    }
    case 'download': {
      const selected = await sources(
        value.item,
        library.getSnapshot().settings,
      );
      const source = selected.find(
        (s) => s.type === 'http' && s.downloadable && !s.live,
      );
      if (!source) throw new Error('No downloadable file source.');
      void downloads.add(value.item, source);
      return snapshot();
    }
    case 'downloadRetry':
      void downloads.retry(value.id);
      return snapshot();
    case 'downloadCancel':
      downloads.cancel(value.id);
      return snapshot();
    case 'downloadRemove':
      await downloads.remove(value.id);
      return snapshot();
    case 'export':
      return JSON.stringify({
        format: 'cinefern-library',
        version: 1,
        watchlist: library.getSnapshot().watchlist,
        history: library.getSnapshot().history,
        settings: library.getSnapshot().settings,
      });
    case 'import': {
      const data = JSON.parse(value.text);
      if (
        data.format !== 'cinefern-library' ||
        data.version !== 1 ||
        !Array.isArray(data.watchlist) ||
        !Array.isArray(data.history)
      )
        throw new Error('Invalid library backup.');
      for (const e of [...data.watchlist, ...data.history])
        assertMediaItem(e.item, e.item.providerId);
      if (
        data.history.some(
          (e: any) =>
            !Number.isFinite(e.position) ||
            !Number.isFinite(e.duration) ||
            e.duration <= 0 ||
            e.position < 0,
        )
      )
        throw new Error('Invalid history.');
      const unique = (entries: any[]) =>
        entries.filter(
          (e, i, all) =>
            all.findIndex((x) => mediaKey(x.item) === mediaKey(e.item)) === i,
        );
      library.update({
        watchlist: unique([
          ...library.getSnapshot().watchlist,
          ...data.watchlist,
        ]),
        history: unique(
          [...library.getSnapshot().history, ...data.history].sort(
            (a, b) => b.updatedAt - a.updatedAt,
          ),
        ).slice(0, 500),
      });
      return snapshot();
    }
    case 'reset':
      agent.cancel();
      for (const d of library.getSnapshot().downloads)
        await downloads.remove(d.id);
      await library.reset();
      await configure();
      return snapshot();
    default:
      throw new Error('Unknown native operation.');
  }
}
Object.assign(globalThis, {
  CinefernNative: {
    dispatch: async (id: string, op: string, json: string) => {
      try {
        const result = await dispatch(op, JSON.parse(json));
        await nativeCall('reply', { id, value: result ?? null });
      } catch (error) {
        await nativeCall('reply', { id, error: String(error).slice(0, 2000) });
      }
    },
  },
});
