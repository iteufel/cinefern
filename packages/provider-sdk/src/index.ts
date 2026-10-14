/** Cinefern provider API v1. Providers are TypeScript, never platform-specific code. */
export const PROVIDER_API_VERSION = 1 as const;
export type MediaType =
  'movie' | 'series' | 'episode' | 'collection' | 'person';
export type StreamType = 'http' | 'hls' | 'dash';
export type SettingValue = string | number | boolean;
export interface MediaRef {
  providerId: string;
  id: string;
}
export interface MediaItem extends MediaRef {
  type: MediaType;
  title: string;
  overview?: string;
  poster?: string;
  backdrop?: string;
  year?: number;
  duration?: number;
  rating?: number;
  genres?: string[];
  adult?: boolean;
  showId?: string;
  season?: number;
  episode?: number;
  info?: Record<string, string>;
  cast?: Person[];
}
export interface Person extends MediaRef {
  name: string;
  role?: string;
  image?: string;
  biography?: string;
}
export interface Season {
  id: string;
  title: string;
  number: number;
  poster?: string;
}
export interface MediaPage {
  items: MediaItem[];
  nextCursor?: string;
}
export interface Collection extends MediaRef {
  title: string;
  description?: string;
  items: MediaItem[];
  nextCursor?: string;
  sorting?: Array<{ id: string; label: string }>;
}
export interface HomeFeed {
  featured: MediaItem[];
  collections: Collection[];
}
export interface Subtitle {
  id: string;
  label: string;
  language: string;
  url: string;
  format?: 'vtt' | 'srt';
}
export interface MediaSource {
  id: string;
  url: string;
  type: StreamType;
  label: string;
  quality?: number;
  audioLanguage?: string;
  headers?: Record<string, string>;
  subtitles?: Subtitle[];
  downloadable?: boolean;
  live?: boolean;
  resolverId?: string;
}
export interface ProviderSetting {
  id: string;
  label: string;
  description?: string;
  type: 'text' | 'password' | 'boolean' | 'select' | 'number';
  default?: SettingValue;
  options?: Array<{ value: string; label: string }>;
}
export type ProviderCapability =
  | 'browse'
  | 'search'
  | 'series'
  | 'collections'
  | 'sources'
  | 'trailers'
  | 'people'
  | 'resolve'
  | 'watchlist';
export interface ProviderManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: typeof PROVIDER_API_VERSION;
  description: string;
  author: string;
  homepage?: string;
  color?: string;
  adult?: boolean;
  capabilities: ProviderCapability[];
  permissions: {
    network: string[];
    storage?: boolean;
    /** Paid, user-enabled agent access. An empty array requests reasoning only. */
    agent?: AgentTool[];
  };
  settings?: ProviderSetting[];
}
export interface HttpResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
}
export interface HttpOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
}
export interface ProviderContext {
  /** Host-owned media agent. Model vendors, credentials, and Deep Agents stay private. */
  agent: ProviderAgent;
  /** Requests are restricted to exact origins declared in the manifest. */
  http: { request(url: string, options?: HttpOptions): Promise<HttpResponse> };
  storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  settings: Readonly<Record<string, SettingValue>>;
  log(message: string): void;
}
export type AgentTool = 'web-search' | 'browser';
export interface AgentCitation {
  title: string;
  url: string;
}
export interface AgentUsage {
  modelCalls: number;
  toolCalls: number;
  searchCalls: number;
}
export interface AgentResult {
  text: string;
  /** Untrusted JSON extracted by the agent; validate before using as application data. */
  data: Record<string, unknown>;
  /** Sources observed by host tools, rather than links invented by the model. */
  citations: AgentCitation[];
  usage: AgentUsage;
}
export interface AgentMediaMatch {
  title: string;
  type: 'movie' | 'series' | 'episode';
  year?: number;
  overview?: string;
  url: string;
}
export interface AgentSearchResult extends AgentResult {
  items: AgentMediaMatch[];
}
export interface AgentResolveRequest {
  instructions: string;
  url?: string;
  /** Send only the metadata needed for this task, never passwords or access tokens. */
  context?: string;
}
export interface ProviderAgent {
  status(): Promise<{
    available: boolean;
    reason?: string;
    tools: AgentTool[];
  }>;
  search(request: {
    query: string;
    limit?: number;
  }): Promise<AgentSearchResult>;
  resolve(request: AgentResolveRequest): Promise<AgentResult>;
}
export interface SearchOptions {
  query: string;
  cursor?: string;
  limit: number;
  type?: MediaType;
}
export interface CollectionOptions {
  cursor?: string;
  limit: number;
  sort?: string;
}
export interface PlaybackPreferences {
  quality: number;
  audioLanguage: string;
  subtitleLanguage: string;
}
export interface MediaProvider {
  initialize?(): Promise<void>;
  dispose?(): Promise<void>;
  getHome?(): Promise<HomeFeed>;
  search?(options: SearchOptions): Promise<MediaPage>;
  getItem(id: string): Promise<MediaItem>;
  getCollection?(id: string, options: CollectionOptions): Promise<Collection>;
  getSeasons?(showId: string): Promise<Season[]>;
  getEpisodes?(showId: string, seasonId: string): Promise<MediaItem[]>;
  getSources?(
    id: string,
    preferences: PlaybackPreferences,
  ): Promise<MediaSource[]>;
  getTrailer?(id: string): Promise<MediaSource | null>;
  getSuggestions?(id: string): Promise<MediaItem[]>;
  getPerson?(id: string): Promise<{ person: Person; credits: MediaItem[] }>;
  /** Extractor support replaces the old separate resolver API. */
  resolve?(url: string): Promise<MediaSource | null>;
  /** Optional extensions can sync an external watchlist. */
  getWatchlist?(): Promise<MediaItem[]>;
  onWatchlistChanged?(item: MediaItem, saved: boolean): Promise<void>;
  onMediaOpened?(item: MediaItem): Promise<void>;
}
export interface ProviderDefinition {
  create(context: ProviderContext): MediaProvider;
}
export interface ProviderBundle {
  format: 'cinefern-provider';
  manifest: ProviderManifest;
  code: string;
}
export function defineProvider(
  definition: ProviderDefinition,
): ProviderDefinition {
  return definition;
}

const capabilities = new Set<ProviderCapability>([
  'browse',
  'search',
  'series',
  'collections',
  'sources',
  'trailers',
  'people',
  'resolve',
  'watchlist',
]);
const reservedIds = new Set(['__proto__', 'constructor', 'prototype']);
export function assertManifest(
  value: unknown,
): asserts value is ProviderManifest {
  if (!value || typeof value !== 'object')
    throw new Error('Missing provider manifest.');
  const manifest = value as ProviderManifest;
  if (
    typeof manifest.id !== 'string' ||
    !/^[a-z][a-z0-9.-]{2,79}$/.test(manifest.id) ||
    reservedIds.has(manifest.id)
  )
    throw new Error(
      'Provider id must be 3–80 lowercase letters, numbers, dots, or hyphens.',
    );
  for (const key of ['name', 'description', 'author'] as const)
    if (
      typeof manifest[key] !== 'string' ||
      !manifest[key].trim() ||
      manifest[key].length > 2000
    )
      throw new Error('Invalid provider ' + key + '.');
  if (
    typeof manifest.version !== 'string' ||
    !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version)
  )
    throw new Error('Provider version must use semantic versioning.');
  if (manifest.apiVersion !== PROVIDER_API_VERSION)
    throw new Error('This provider requires a different Cinefern API version.');
  if (
    !Array.isArray(manifest.capabilities) ||
    manifest.capabilities.some((c) => !capabilities.has(c))
  )
    throw new Error('Unknown provider capability.');
  if (
    !manifest.permissions ||
    !Array.isArray(manifest.permissions.network) ||
    manifest.permissions.network.length > 50
  )
    throw new Error('Provider must declare network origins.');
  for (const origin of manifest.permissions.network) {
    const url = new URL(origin);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.origin !== origin ||
      url.username ||
      url.password
    )
      throw new Error(
        'Network permissions must be exact HTTP(S) origins, without paths or wildcards.',
      );
  }
  if (
    manifest.permissions.agent !== undefined &&
    (!Array.isArray(manifest.permissions.agent) ||
      manifest.permissions.agent.length > 2 ||
      new Set(manifest.permissions.agent).size !==
        manifest.permissions.agent.length ||
      manifest.permissions.agent.some(
        (tool) => !['web-search', 'browser'].includes(tool),
      ))
  )
    throw new Error('Unknown or duplicate agent permission.');
  if (manifest.color && !/^#[0-9a-fA-F]{6}$/.test(manifest.color))
    throw new Error('Provider color must be a hex color.');
  if (manifest.homepage) {
    const url = new URL(manifest.homepage);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error('Provider website must use HTTP(S).');
  }
  if (
    manifest.settings !== undefined &&
    (!Array.isArray(manifest.settings) || manifest.settings.length > 50)
  )
    throw new Error('A provider may declare up to 50 settings.');
  const ids = new Set<string>();
  for (const setting of manifest.settings ?? []) {
    if (
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(setting.id) ||
      reservedIds.has(setting.id) ||
      ids.has(setting.id)
    )
      throw new Error('Invalid or duplicate provider setting id.');
    ids.add(setting.id);
    if (
      !['text', 'password', 'boolean', 'select', 'number'].includes(
        setting.type,
      ) ||
      typeof setting.label !== 'string'
    )
      throw new Error('Invalid provider setting.');
  }
}
export function parseBundle(text: string): ProviderBundle {
  if (text.length > 2_000_000)
    throw new Error('Provider bundles must be smaller than 2 MB.');
  const bundle = JSON.parse(text) as ProviderBundle;
  if (
    bundle?.format !== 'cinefern-provider' ||
    typeof bundle.code !== 'string' ||
    !bundle.code.trim()
  )
    throw new Error('Choose a compiled .cfprovider file.');
  assertManifest(bundle.manifest);
  return bundle;
}
export function mediaKey(item: MediaRef): string {
  return JSON.stringify([item.providerId, item.id]);
}
export function assertMediaItem(
  value: unknown,
  providerId: string,
): asserts value is MediaItem {
  const item = value as MediaItem;
  if (
    !item ||
    typeof item.id !== 'string' ||
    !item.id ||
    typeof item.title !== 'string' ||
    !item.title.trim() ||
    item.providerId !== providerId ||
    !['movie', 'series', 'episode', 'collection', 'person'].includes(item.type)
  )
    throw new Error('Provider returned invalid media metadata.');
}
export function assertSource(value: unknown): asserts value is MediaSource {
  const source = value as MediaSource;
  if (
    !source ||
    typeof source.id !== 'string' ||
    typeof source.label !== 'string' ||
    !['http', 'hls', 'dash'].includes(source.type)
  )
    throw new Error('Provider returned an invalid media source.');
  const url = new URL(source.url);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error('Media sources must use HTTP or HTTPS.');
  for (const subtitle of source.subtitles ?? []) {
    const uri = new URL(subtitle.url);
    if (!['http:', 'https:'].includes(uri.protocol))
      throw new Error('Subtitle URLs must use HTTP or HTTPS.');
  }
}
export function chooseSource(
  sources: MediaSource[],
  preferences: PlaybackPreferences,
): MediaSource | undefined {
  return [...sources].sort((a, b) => {
    const score = (s: MediaSource) =>
      (s.audioLanguage === preferences.audioLanguage ? 1_000_000 : 0) +
      ((s.quality ?? 0) <= preferences.quality
        ? 100_000 + (s.quality ?? 0)
        : -(s.quality ?? 0));
    return score(b) - score(a);
  })[0];
}
