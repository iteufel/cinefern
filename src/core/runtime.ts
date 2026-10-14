import Sandbox from '@nyariv/sandboxjs';
import {
  assertManifest,
  assertMediaItem,
  assertSource,
  type Collection,
  type HomeFeed,
  type HttpOptions,
  type HttpResponse,
  type MediaItem,
  type MediaPage,
  type MediaProvider,
  type ProviderBundle,
  type ProviderContext,
  type ProviderDefinition,
  type ProviderManifest,
  type SettingValue,
} from '@cinefern/provider-sdk';
import type { KeyValueStorage } from './library';
import type { MediaAgentService } from '../agent/service';

export interface ProviderRecord {
  manifest: ProviderManifest;
  provider: MediaProvider;
  builtin: boolean;
  error?: string;
}
export type HttpTransport = (
  url: string,
  options?: HttpOptions,
) => Promise<HttpResponse>;
export class ProviderRuntime {
  private records = new Map<string, ProviderRecord>();
  private cache = new Map<string, { until: number; value: unknown }>();
  private leases = new Map<string, { active: boolean }>();
  constructor(
    private storage: KeyValueStorage,
    private transport: HttpTransport,
    private agent?: MediaAgentService,
  ) {}
  all(): ProviderRecord[] {
    return [...this.records.values()];
  }
  get(id: string): ProviderRecord {
    const record = this.records.get(id);
    if (!record)
      throw new Error(
        'This provider is unavailable. Enable or reinstall it in Providers.',
      );
    if (record.error) throw new Error(record.error);
    return record;
  }
  context(
    manifest: ProviderManifest,
    settings: Record<string, SettingValue>,
    isActive = () => true,
  ): ProviderContext {
    const defaults = Object.fromEntries(
      (manifest.settings ?? []).map((s) => [s.id, s.default ?? '']),
    );
    const key = (name: string) => {
      if (!manifest.permissions.storage)
        throw new Error('This provider has no storage permission.');
      if (name.length > 160) throw new Error('Storage key is too long.');
      return 'cinefern.provider.' + manifest.id + '.' + name;
    };
    return {
      agent: this.agent
        ? this.agent.forProvider(manifest, isActive)
        : {
            status: async () => ({
              available: false,
              reason: 'Agent service is unavailable.',
              tools: [],
            }),
            search: async () => {
              throw new Error('Agent service is unavailable.');
            },
            resolve: async () => {
              throw new Error('Agent service is unavailable.');
            },
          },
      settings: Object.freeze({ ...defaults, ...settings }),
      http: {
        request: async (url, options) => {
          const parsed = new URL(url);
          if (
            parsed.username ||
            parsed.password ||
            !manifest.permissions.network.includes(parsed.origin)
          )
            throw new Error(
              'Provider is not permitted to access ' + parsed.origin + '.',
            );
          return this.transport(url, options);
        },
      },
      storage: {
        get: (name) => this.storage.get(key(name)),
        set: (name, value) => {
          if (value.length > 1_000_000)
            throw new Error(
              'Provider storage values must be smaller than 1 MB.',
            );
          return this.storage.set(key(name), value);
        },
        remove: (name) => this.storage.remove(key(name)),
      },
      log: (message) =>
        console.info('[' + manifest.id + '] ' + message.slice(0, 2000)),
    };
  }
  async register(
    manifest: ProviderManifest,
    definition: ProviderDefinition,
    settings: Record<string, SettingValue> = {},
    builtin = true,
  ) {
    assertManifest(manifest);
    const lease = { active: false };
    const context = this.context(manifest, settings, () => lease.active);
    const provider = definition.create(context);
    if (!provider || typeof provider.getItem !== 'function')
      throw new Error('A provider must implement getItem.');
    const required: Record<string, string[]> = {
      browse: ['getHome'],
      search: ['search'],
      sources: ['getSources'],
      series: ['getSeasons', 'getEpisodes'],
      collections: ['getCollection'],
      trailers: ['getTrailer'],
      people: ['getPerson'],
      resolve: ['resolve'],
      watchlist: ['getWatchlist'],
    };
    for (const capability of manifest.capabilities)
      for (const method of required[capability] ?? [])
        if (typeof provider[method as keyof MediaProvider] !== 'function')
          throw new Error('Provider is missing ' + method + '.');
    const previous = this.records.get(manifest.id);
    const previousLease = this.leases.get(manifest.id);
    if (previousLease) previousLease.active = false;
    lease.active = true;
    this.leases.set(manifest.id, lease);
    this.agent?.cancel(manifest.id);
    if (previous) await previous.provider.dispose?.();
    this.cache.clear();
    const record: ProviderRecord = { manifest, provider, builtin };
    this.records.set(manifest.id, record);
    try {
      if (provider.initialize)
        await this.withTimeout(
          provider.initialize(),
          manifest.permissions.agent ? 130_000 : 25_000,
          () => this.agent?.cancel(manifest.id),
        );
    } catch (error) {
      record.error = 'Provider initialization failed: ' + String(error);
    }
    return record;
  }
  async install(
    bundle: ProviderBundle,
    settings: Record<string, SettingValue> = {},
  ) {
    assertManifest(bundle.manifest);
    // Interpreter execution keeps provider code away from host globals, Node, and the DOM.
    const sandbox = new Sandbox({ executionQuota: 5_000_000n });
    const definition = sandbox
      .compile(bundle.code + '\nreturn CinefernProvider;')()
      .run() as ProviderDefinition;
    return this.register(bundle.manifest, definition, settings, false);
  }
  async remove(id: string) {
    const lease = this.leases.get(id);
    if (lease) lease.active = false;
    this.leases.delete(id);
    this.agent?.cancel(id);
    const record = this.records.get(id);
    this.records.delete(id);
    this.cache.clear();
    await record?.provider.dispose?.();
  }
  clearCache() {
    this.cache.clear();
  }
  private async withTimeout<T>(
    promise: Promise<T>,
    milliseconds = 25_000,
    onTimeout?: () => void,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            onTimeout?.();
            reject(new Error('Provider request timed out.'));
          }, milliseconds);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  async call<T>(
    id: string,
    method: keyof MediaProvider,
    args: unknown[] = [],
    cached = false,
  ): Promise<T> {
    const record = this.get(id);
    const fn = record.provider[method];
    if (typeof fn !== 'function')
      throw new Error(record.manifest.name + ' does not support this feature.');
    const key = JSON.stringify([id, method, args]);
    const found = this.cache.get(key);
    if (cached && found && found.until > Date.now()) return found.value as T;
    const result: unknown = await this.withTimeout(
      Promise.resolve(
        (fn as (...a: unknown[]) => unknown).apply(record.provider, args),
      ),
      record.manifest.permissions.agent ? 130_000 : 25_000,
      () => this.agent?.cancel(id),
    );
    const validateItems = (items: MediaItem[]) => {
      if (!Array.isArray(items) || items.length > 10_000)
        throw new Error('Provider returned an invalid media list.');
      items.forEach((item) => assertMediaItem(item, id));
    };
    if (method === 'getItem') assertMediaItem(result, id);
    if (['getEpisodes', 'getSuggestions', 'getWatchlist'].includes(method))
      validateItems(result as MediaItem[]);
    if (method === 'getHome') {
      const home = result as HomeFeed;
      validateItems(home.featured);
      if (!Array.isArray(home.collections))
        throw new Error('Provider returned an invalid home feed.');
      for (const collection of home.collections)
        validateItems(collection.items);
    }
    if (method === 'search') validateItems((result as MediaPage).items);
    if (method === 'getCollection') validateItems((result as Collection).items);
    if (method === 'getSources') {
      if (!Array.isArray(result) || result.length > 100)
        throw new Error('Provider returned invalid sources.');
      result.forEach(assertSource);
    }
    if ((method === 'getTrailer' || method === 'resolve') && result !== null)
      assertSource(result);
    if (cached)
      this.cache.set(key, { until: Date.now() + 120_000, value: result });
    return result as T;
  }
}
