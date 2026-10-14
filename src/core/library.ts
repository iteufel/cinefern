import {
  mediaKey,
  type MediaItem,
  type ProviderBundle,
  type SettingValue,
} from '@cinefern/provider-sdk';

export interface KeyValueStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys?(): Promise<string[]>;
}
export interface Settings {
  language: 'en' | 'de';
  quality: number;
  audioLanguage: string;
  subtitleLanguage: string;
  autoplay: boolean;
  resume: boolean;
  autoplayTrailers: boolean;
  cropTrailers: boolean;
  scrollVolume: boolean;
  volume: number;
  showAdult: boolean;
  detailPresentation: 'page' | 'modal';
  vibrancy: boolean;
}
export interface WatchlistEntry {
  item: MediaItem;
  addedAt: number;
  notify: boolean;
  knownEpisodes: string[];
  newEpisodes: MediaItem[];
}
export interface HistoryEntry {
  item: MediaItem;
  position: number;
  duration: number;
  updatedAt: number;
}
export interface InstalledPlugin {
  bundle: ProviderBundle;
  enabled: boolean;
  installedAt: number;
  settings: Record<string, SettingValue>;
}
export interface DownloadEntry {
  id: string;
  item: MediaItem;
  sourceUrl: string;
  headers?: Record<string, string>;
  status: 'queued' | 'downloading' | 'complete' | 'cancelled' | 'failed';
  progress: number;
  bytes: number;
  totalBytes?: number;
  localUri?: string;
  error?: string;
  createdAt: number;
}
export interface LibraryState {
  version: 1;
  ready: boolean;
  setupComplete: boolean;
  settings: Settings;
  watchlist: WatchlistEntry[];
  history: HistoryEntry[];
  plugins: InstalledPlugin[];
  downloads: DownloadEntry[];
  disabledProviders: string[];
  providerSettings: Record<string, Record<string, SettingValue>>;
  resolverOrder: string[];
  persistenceError?: string;
}
export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  quality: 1080,
  audioLanguage: 'en',
  subtitleLanguage: '',
  autoplay: true,
  resume: true,
  autoplayTrailers: false,
  cropTrailers: true,
  scrollVolume: false,
  volume: 0.85,
  showAdult: false,
  detailPresentation: 'page',
  vibrancy: true,
};
export function initialState(): LibraryState {
  return {
    version: 1,
    ready: false,
    setupComplete: false,
    settings: { ...DEFAULT_SETTINGS },
    watchlist: [],
    history: [],
    plugins: [],
    downloads: [],
    disabledProviders: [],
    providerSettings: {},
    resolverOrder: [],
  };
}
export function continueWatching(history: HistoryEntry[]): HistoryEntry[] {
  const shows = new Set<string>();
  return [...history]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((entry) => {
      if (entry.item.showId) {
        const key = mediaKey({
          providerId: entry.item.providerId,
          id: entry.item.showId,
        });
        if (shows.has(key)) return false;
        shows.add(key);
      }
      return (
        entry.duration > 0 &&
        entry.position / entry.duration >= 0.025 &&
        entry.position / entry.duration < 0.925
      );
    });
}
const STATE_KEY = 'cinefern.library.v1';
export class LibraryStore {
  private state = initialState();
  private listeners = new Set<() => void>();
  private writeQueue: Promise<void> = Promise.resolve();
  constructor(readonly storage: KeyValueStorage) {}
  getSnapshot = (): LibraryState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private emit() {
    for (const listener of this.listeners) listener();
  }
  async initialize() {
    if (this.state.ready) return;
    try {
      const raw = await this.storage.get(STATE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as LibraryState;
        if (
          saved.version !== 1 ||
          !Array.isArray(saved.watchlist) ||
          !Array.isArray(saved.history) ||
          !Array.isArray(saved.plugins) ||
          !Array.isArray(saved.downloads)
        )
          throw new Error('Invalid saved library.');
        this.state = {
          ...initialState(),
          ...saved,
          ready: true,
          settings: { ...DEFAULT_SETTINGS, ...saved.settings },
          downloads: saved.downloads.map((d) =>
            d.status === 'downloading' || d.status === 'queued'
              ? {
                  ...d,
                  status: 'failed',
                  error: 'Download interrupted. Retry to continue.',
                }
              : d,
          ),
        };
      } else this.state = { ...this.state, ready: true };
    } catch (error) {
      this.state = {
        ...initialState(),
        ready: true,
        persistenceError: 'Could not restore your library: ' + String(error),
      };
    }
    this.emit();
  }
  update(patch: Partial<LibraryState>) {
    this.state = { ...this.state, ...patch };
    this.emit();
    const snapshot = JSON.stringify({
      ...this.state,
      persistenceError: undefined,
    });
    this.writeQueue = this.writeQueue
      .then(() => this.storage.set(STATE_KEY, snapshot))
      .catch((error) => {
        this.state = {
          ...this.state,
          persistenceError: 'Could not save your library: ' + String(error),
        };
        this.emit();
      });
  }
  flush(): Promise<void> {
    return this.writeQueue;
  }
  setSettings(patch: Partial<Settings>) {
    this.update({ settings: { ...this.state.settings, ...patch } });
  }
  isSaved(item: MediaItem): boolean {
    return this.state.watchlist.some(
      (e) => mediaKey(e.item) === mediaKey(item),
    );
  }
  toggleWatchlist(item: MediaItem): boolean {
    const saved = this.isSaved(item);
    this.update({
      watchlist: saved
        ? this.state.watchlist.filter(
            (e) => mediaKey(e.item) !== mediaKey(item),
          )
        : [
            {
              item,
              addedAt: Date.now(),
              notify: false,
              knownEpisodes: [],
              newEpisodes: [],
            },
            ...this.state.watchlist,
          ],
    });
    return !saved;
  }
  updateWatchlist(item: MediaItem, patch: Partial<WatchlistEntry>) {
    this.update({
      watchlist: this.state.watchlist.map((e) =>
        mediaKey(e.item) === mediaKey(item) ? { ...e, ...patch } : e,
      ),
    });
  }
  recordProgress(item: MediaItem, position: number, duration: number) {
    if (
      !Number.isFinite(position) ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      position < 0
    )
      return;
    const previous = this.state.history.filter(
      (e) => mediaKey(e.item) !== mediaKey(item),
    );
    this.update({
      history: [
        {
          item,
          position: Math.min(position, duration),
          duration,
          updatedAt: Date.now(),
        },
        ...previous,
      ].slice(0, 500),
    });
  }
  progress(item: MediaItem) {
    return this.state.history.find((e) => mediaKey(e.item) === mediaKey(item));
  }
  install(bundle: ProviderBundle) {
    const old = this.state.plugins.find(
      (p) => p.bundle.manifest.id === bundle.manifest.id,
    );
    this.update({
      plugins: [
        ...this.state.plugins.filter((p) => p !== old),
        {
          bundle,
          enabled: old?.enabled ?? true,
          installedAt: Date.now(),
          settings: old?.settings ?? {},
        },
      ],
    });
  }
  removePlugin(id: string) {
    const { [id]: removed, ...providerSettings } = this.state.providerSettings;
    this.update({
      plugins: this.state.plugins.filter((p) => p.bundle.manifest.id !== id),
      disabledProviders: this.state.disabledProviders.filter((p) => p !== id),
      providerSettings,
    });
  }
  setProviderEnabled(id: string, enabled: boolean) {
    this.update({
      disabledProviders: enabled
        ? this.state.disabledProviders.filter((p) => p !== id)
        : [...new Set([...this.state.disabledProviders, id])],
      plugins: this.state.plugins.map((p) =>
        p.bundle.manifest.id === id ? { ...p, enabled } : p,
      ),
    });
  }
  setProviderSettings(id: string, settings: Record<string, SettingValue>) {
    this.update({
      providerSettings: { ...this.state.providerSettings, [id]: settings },
      plugins: this.state.plugins.map((p) =>
        p.bundle.manifest.id === id ? { ...p, settings } : p,
      ),
    });
  }
  updateDownload(id: string, patch: Partial<DownloadEntry>) {
    this.update({
      downloads: this.state.downloads.map((d) =>
        d.id === id ? { ...d, ...patch } : d,
      ),
    });
  }
  async reset() {
    await this.flush();
    await this.storage.remove(STATE_KEY);
    if (this.storage.keys)
      for (const key of await this.storage.keys())
        if (key.startsWith('cinefern.')) await this.storage.remove(key);
    this.state = { ...initialState(), ready: true };
    this.emit();
  }
}
