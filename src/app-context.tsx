import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { BackHandler, Platform } from 'react-native';
import {
  chooseSource,
  mediaKey,
  type MediaItem,
  type MediaSource,
  type ProviderBundle,
  type ProviderManifest,
  type Season,
  type SettingValue,
} from '@cinefern/provider-sdk';
import { LibraryStore, type LibraryState } from './core/library';
import { DownloadManager } from './core/downloads';
import { ProviderRuntime } from './core/runtime';
import { JellyfinConnection } from './core/jellyfin-connection';
import { platform } from './platform';
import { MediaAgentService } from './agent/service';
import { revokeAgentGrant } from './agent/settings';
import { useTVBackHandling } from './ui/focus';
import { openFilmsManifest, openFilmsProvider } from './providers/open-films';
import {
  jsonLibraryManifest,
  jsonLibraryProvider,
} from './providers/json-library';
import {
  jellyfinConfiguredManifest,
  jellyfinManifest,
  jellyfinProvider,
} from './providers/jellyfin';

export type Route =
  | {
      name:
        | 'home'
        | 'search'
        | 'watchlist'
        | 'downloads'
        | 'providers'
        | 'settings'
        | 'history';
      providerId?: string;
      filter?: 'movie' | 'series';
    }
  | { name: 'item'; item: MediaItem }
  | { name: 'collection'; providerId: string; id: string; title: string }
  | { name: 'person'; providerId: string; id: string; title: string };
export interface Playback {
  item: MediaItem;
  sources: MediaSource[];
  source: MediaSource;
  queue: MediaItem[];
  index: number;
  trailer?: boolean;
  startAt: number;
}
const library = new LibraryStore(platform.storage);
const agent = new MediaAgentService(platform.storage, platform.agent);
const runtime = new ProviderRuntime(
  platform.storage,
  (url, options) => platform.request(url, options),
  agent,
);
const downloads = new DownloadManager(library, platform);
const jellyfin = new JellyfinConnection(platform.storage, (url, options) =>
  platform.request(url, options),
);
const builtinManifests = [
  openFilmsManifest,
  jellyfinManifest,
  jsonLibraryManifest,
];
interface AppContextValue {
  state: LibraryState;
  library: LibraryStore;
  runtime: ProviderRuntime;
  agent: MediaAgentService;
  downloads: DownloadManager;
  route: Route;
  navigate(route: Route): void;
  back(): void;
  canGoBack: boolean;
  screenActive: boolean;
  providerRevision: number;
  providersReady: boolean;
  manifests: ProviderManifest[];
  playback: Playback | null;
  setPlayback: React.Dispatch<React.SetStateAction<Playback | null>>;
  play(item: MediaItem, queue?: MediaItem[], trailer?: boolean): Promise<void>;
  next(offset: number): Promise<void>;
  playingLoading: boolean;
  toggleSave(item: MediaItem): void;
  configureProviders(): Promise<void>;
  installPlugin(bundle: ProviderBundle): Promise<void>;
  updateProviderSettings(
    id: string,
    settings: Record<string, SettingValue>,
  ): Promise<void>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
  disconnectJellyfin(): Promise<void>;
  uninstall(id: string): Promise<void>;
  toggleNotify(item: MediaItem): Promise<void>;
  checkUpdates(): Promise<void>;
  toast: string;
  notify(message: string): void;
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
}
const Context = createContext<AppContextValue | null>(null);
let configuring: Promise<void> = Promise.resolve();
export function AppProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(
    library.subscribe,
    library.getSnapshot,
    library.getSnapshot,
  );
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [providerRevision, setRevision] = useState(0);
  const [providersReady, setProvidersReady] = useState(false);
  const [playingLoading, setPlayingLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  // Let the remote's Back button return to the tvOS home screen at our root.
  useTVBackHandling(stack.length > 1 || !!playback);
  const notify = useCallback((message: string) => setToast(message), []);
  const configureProviders = useCallback(async () => {
    configuring = configuring
      .catch(() => {})
      .then(async () => {
        const current = library.getSnapshot();
        const enabled = (id: string) => !current.disabledProviders.includes(id);
        const wanted = new Set([
          ...builtinManifests.filter((m) => enabled(m.id)).map((m) => m.id),
          ...current.plugins
            .filter((p) => p.enabled && enabled(p.bundle.manifest.id))
            .map((p) => p.bundle.manifest.id),
        ]);
        for (const record of runtime.all())
          if (!wanted.has(record.manifest.id))
            await runtime.remove(record.manifest.id);
        if (enabled(openFilmsManifest.id))
          await runtime.register(openFilmsManifest, openFilmsProvider);
        if (enabled(jellyfinManifest.id)) {
          let settings: Record<string, SettingValue> = {};
          try {
            settings = await jellyfin.restore(
              current.providerSettings[jellyfinManifest.id] ?? {},
            );
          } catch {
            notify(
              'Could not read your saved Jellyfin session. Reconnect in Providers.',
            );
          }
          await runtime.register(
            jellyfinConfiguredManifest(settings),
            jellyfinProvider,
            settings,
          );
        }
        if (enabled(jsonLibraryManifest.id)) {
          const settings =
            current.providerSettings[jsonLibraryManifest.id] ?? {};
          let origins: string[] = [];
          if (settings.catalogUrl) {
            const url = new URL(String(settings.catalogUrl));
            if (!['https:', 'http:'].includes(url.protocol))
              throw new Error('Your catalog URL must use HTTP or HTTPS.');
            origins = [url.origin];
          }
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
        for (const plugin of current.plugins.filter(
          (p) => p.enabled && enabled(p.bundle.manifest.id),
        )) {
          try {
            await runtime.install(plugin.bundle, plugin.settings);
          } catch (error) {
            notify(plugin.bundle.manifest.name + ': ' + String(error));
          }
        }
        setRevision((r) => r + 1);
        setProvidersReady(true);
      });
    await configuring;
  }, [notify]);
  useEffect(() => {
    void library
      .initialize()
      .then(configureProviders)
      .catch((error) => {
        notify(String(error));
        setProvidersReady(true);
      });
  }, [configureProviders]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  const navigate = useCallback(
    (route: Route) => setStack((s) => [...s, route].slice(-50)),
    [],
  );
  const back = useCallback(
    () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    [],
  );
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (playback) {
        setPlayback(null);
        return true;
      }
      if (stack.length > 1) {
        back();
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [playback, stack.length, back]);
  async function play(item: MediaItem, queue = [item], trailer = false) {
    setPlayingLoading(true);
    try {
      const settings = library.getSnapshot().settings;
      const downloaded = library
        .getSnapshot()
        .downloads.find(
          (d) => mediaKey(d.item) === mediaKey(item) && d.status === 'complete',
        );
      let sources: MediaSource[];
      if (downloaded?.localUri && !trailer)
        sources = [
          {
            id: 'offline',
            label: 'Downloaded',
            type: 'http',
            url: await platform.localMediaUri(downloaded.localUri),
          },
        ];
      else if (item.providerId === 'direct')
        sources = [
          {
            id: 'direct',
            label: 'Direct stream',
            type: /\.m3u8(?:[?#]|$)/i.test(item.id)
              ? 'hls'
              : /\.mpd(?:[?#]|$)/i.test(item.id)
                ? 'dash'
                : 'http',
            url: item.id,
            downloadable: !/\.(m3u8|mpd)(?:[?#]|$)/i.test(item.id),
          },
        ];
      else if (trailer) {
        const source = await runtime.call<MediaSource | null>(
          item.providerId,
          'getTrailer',
          [item.id],
        );
        sources = source ? [source] : [];
      } else
        sources = await runtime.call<MediaSource[]>(
          item.providerId,
          'getSources',
          [item.id, settings],
        );
      // AVPlayer does not play DASH; provider authors should offer an HLS alternative.
      if (Platform.OS === 'ios')
        sources = sources.filter((s) => s.type !== 'dash');
      const source = chooseSource(sources, settings);
      if (!source)
        throw new Error(
          Platform.OS === 'ios'
            ? 'No compatible source. This provider must offer an HLS or file source for ' +
                platform.name +
                '.'
            : 'This provider has no playable sources.',
        );
      const history = library.progress(item);
      const startAt =
        !trailer &&
        settings.resume &&
        history &&
        history.position / history.duration < 0.925
          ? history.position
          : 0;
      setPlayback({
        item,
        sources,
        source,
        queue,
        index: Math.max(
          0,
          queue.findIndex((i) => mediaKey(i) === mediaKey(item)),
        ),
        trailer,
        startAt,
      });
    } catch (error) {
      notify(String(error).replace(/^Error: /, ''));
    } finally {
      setPlayingLoading(false);
    }
  }
  async function next(offset: number) {
    if (!playback) return;
    const item = playback.queue[playback.index + offset];
    if (item) await play(item, playback.queue);
    else setPlayback(null);
  }
  function toggleSave(item: MediaItem) {
    const saved = library.toggleWatchlist(item);
    notify(
      saved
        ? state.settings.language === 'de'
          ? 'Zur Merkliste hinzugefügt'
          : 'Added to your watchlist'
        : state.settings.language === 'de'
          ? 'Aus der Merkliste entfernt'
          : 'Removed from your watchlist',
    );
    try {
      const provider = runtime.get(item.providerId).provider;
      if (provider.onWatchlistChanged)
        void provider
          .onWatchlistChanged(item, saved)
          .catch((error) => notify(String(error)));
    } catch {}
  }
  async function episodeSnapshot(item: MediaItem) {
    const seasons = await runtime.call<Season[]>(
      item.providerId,
      'getSeasons',
      [item.id],
    );
    const results = await Promise.all(
      seasons.map((season) =>
        runtime.call<MediaItem[]>(item.providerId, 'getEpisodes', [
          item.id,
          season.id,
        ]),
      ),
    );
    return results.flat();
  }
  async function toggleNotify(item: MediaItem) {
    const entry = library
      .getSnapshot()
      .watchlist.find((e) => mediaKey(e.item) === mediaKey(item));
    if (!entry) return;
    if (entry.notify)
      library.updateWatchlist(item, { notify: false, newEpisodes: [] });
    else {
      const episodes = await episodeSnapshot(item);
      library.updateWatchlist(item, {
        notify: true,
        knownEpisodes: episodes.map(mediaKey),
        newEpisodes: [],
      });
    }
  }
  async function checkUpdates() {
    let count = 0;
    const results = await Promise.allSettled(
      library
        .getSnapshot()
        .watchlist.filter((e) => e.notify)
        .map(async (entry) => {
          const episodes = await episodeSnapshot(entry.item);
          const fresh = episodes.filter(
            (ep) => !entry.knownEpisodes.includes(mediaKey(ep)),
          );
          count += fresh.length;
          library.updateWatchlist(entry.item, {
            knownEpisodes: episodes.map(mediaKey),
            newEpisodes: [...entry.newEpisodes, ...fresh].filter(
              (ep, i, all) =>
                all.findIndex((e) => mediaKey(e) === mediaKey(ep)) === i,
            ),
          });
        }),
    );
    const failures = results.filter((r) => r.status === 'rejected');
    notify(
      count
        ? count + ' new episodes in your watchlist'
        : failures.length
          ? 'Some providers could not be checked. Try again.'
          : 'Your watchlist is up to date',
    );
  }
  async function installPlugin(bundle: ProviderBundle) {
    if (builtinManifests.some((m) => m.id === bundle.manifest.id))
      throw new Error('A plugin cannot replace a built-in provider.');
    agent.cancel(bundle.manifest.id);
    await revokeAgentGrant(platform.storage, bundle.manifest.id);
    await runtime.install(bundle);
    library.install(bundle);
    setRevision((r) => r + 1);
    notify(bundle.manifest.name + ' installed');
  }
  async function updateProviderSettings(
    id: string,
    settings: Record<string, SettingValue>,
  ) {
    if (id === jellyfinManifest.id) {
      const saved = await jellyfin.connect(settings);
      library.setProviderSettings(id, saved);
      library.setProviderEnabled(id, true);
      await configureProviders();
      notify('Connected to Jellyfin as ' + saved.username);
      return;
    }
    if (id === jsonLibraryManifest.id && settings.catalogUrl) {
      const url = new URL(String(settings.catalogUrl));
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error(
          'Enter an HTTP(S) catalog URL without embedded credentials.',
        );
    }
    library.setProviderSettings(id, settings);
    await configureProviders();
    notify('Provider settings saved');
  }
  async function disconnectJellyfin() {
    if (playback?.item.providerId === jellyfinManifest.id) setPlayback(null);
    await jellyfin.disconnect();
    library.setProviderSettings(jellyfinManifest.id, {});
    await configureProviders();
    notify('Disconnected from Jellyfin');
  }
  async function setEnabled(id: string, enabled: boolean) {
    library.setProviderEnabled(id, enabled);
    await configureProviders();
  }
  async function uninstall(id: string) {
    await revokeAgentGrant(platform.storage, id);
    await runtime.remove(id);
    library.removePlugin(id);
    setRevision((r) => r + 1);
    notify('Provider removed');
  }
  const manifests = useMemo(
    () => [...builtinManifests, ...state.plugins.map((p) => p.bundle.manifest)],
    [state.plugins],
  );
  return (
    <Context.Provider
      value={{
        state,
        library,
        runtime,
        agent,
        downloads,
        route: stack[stack.length - 1]!,
        navigate,
        back,
        canGoBack: stack.length > 1,
        screenActive: true,
        providerRevision,
        providersReady,
        manifests,
        playback,
        setPlayback,
        play,
        next,
        playingLoading,
        toggleSave,
        configureProviders,
        installPlugin,
        updateProviderSettings,
        setEnabled,
        disconnectJellyfin,
        uninstall,
        toggleNotify,
        checkUpdates,
        toast,
        notify,
        searchQuery,
        setSearchQuery,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useApp() {
  const context = useContext(Context);
  if (!context) throw new Error('Missing AppProvider.');
  return context;
}

// Native navigators keep screens mounted. Scope each screen's route so a push
// never changes the media being rendered by the screen underneath it.
export function AppNavigationProvider({
  children,
  ...navigation
}: Pick<
  AppContextValue,
  'route' | 'navigate' | 'back' | 'canGoBack' | 'screenActive'
> & {
  children: React.ReactNode;
}) {
  const app = useApp();
  return (
    <Context.Provider value={{ ...app, ...navigation }}>
      {children}
    </Context.Provider>
  );
}
