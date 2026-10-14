import {
  defineProvider,
  type Collection,
  type HttpOptions,
  type HttpResponse,
  type MediaItem,
  type MediaSource,
  type MediaType,
  type Person,
  type PlaybackPreferences,
  type ProviderManifest,
  type SettingValue,
} from '@cinefern/provider-sdk';

export const jellyfinManifest: ProviderManifest = {
  id: 'io.github.iteufel.cinefern.jellyfin',
  name: 'Jellyfin',
  version: '1.0.0',
  apiVersion: 1,
  description:
    'Your Jellyfin movies and shows, on every screen. Connect your server to browse and play your library.',
  author: 'Cinefern',
  homepage: 'https://jellyfin.org',
  color: '#aa5cc3',
  capabilities: [
    'browse',
    'search',
    'series',
    'collections',
    'sources',
    'people',
  ],
  permissions: { network: [], storage: false },
  settings: [
    {
      id: 'serverUrl',
      label: 'Server URL',
      type: 'text',
      description:
        'For example, http://192.168.1.20:8096 or https://media.example.com/jellyfin.',
    },
    { id: 'username', label: 'Username', type: 'text' },
    {
      id: 'password',
      label: 'Password',
      type: 'password',
      description: 'Used only to sign in. Your password is never saved.',
    },
  ],
};

export type JellyfinTransport = (
  url: string,
  options?: HttpOptions,
) => Promise<HttpResponse>;
export interface JellyfinSession {
  serverUrl: string;
  username: string;
  userId: string;
  accessToken: string;
  deviceId: string;
}
interface Stream {
  Index?: number;
  Type?: string;
  Codec?: string;
  Language?: string;
  DisplayTitle?: string;
  Height?: number;
  IsTextSubtitleStream?: boolean;
  IsExternalUrl?: boolean;
}
interface Source {
  Id?: string;
  Name?: string;
  Container?: string;
  SupportsDirectPlay?: boolean;
  TranscodingUrl?: string;
  MediaStreams?: Stream[];
  DefaultAudioStreamIndex?: number;
}
interface Item {
  Id?: string;
  Name?: string;
  Type?: string;
  CollectionType?: string;
  Overview?: string;
  ProductionYear?: number;
  RunTimeTicks?: number;
  CommunityRating?: number;
  Genres?: string[];
  SeriesId?: string;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  ImageTags?: Record<string, string>;
  BackdropImageTags?: string[];
  ParentBackdropItemId?: string;
  ParentBackdropImageTags?: string[];
  SeriesPrimaryImageTag?: string;
  People?: Array<{
    Id?: string;
    Name?: string;
    Role?: string;
    PrimaryImageTag?: string;
  }>;
}
interface Items {
  Items?: Item[];
  TotalRecordCount?: number;
}
interface PlaybackInfo {
  MediaSources?: Source[];
  ErrorCode?: string;
  PlaySessionId?: string;
}
type Query = Record<string, string | number | boolean | undefined>;
const fields = 'Overview,Genres,People,MediaSources,MediaStreams';
const types: Partial<Record<MediaType, string>> = {
  movie: 'Movie,Video',
  series: 'Series',
  episode: 'Episode',
  collection: 'BoxSet',
  person: 'Person',
};

export function normalizeJellyfinUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(
      'Enter your Jellyfin server’s full URL, including http:// or https://.',
    );
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Use an HTTP(S) server URL without embedded credentials, a query, or a fragment.',
    );
  return url.href.replace(/\/+$/, '');
}

function urlFor(server: string, path: string, query: Query = {}): string {
  const url = new URL(server + '/' + path.replace(/^\/+/, ''));
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) url.searchParams.set(key, String(value));
  return url.href;
}
function authorization(deviceId: string, token?: string) {
  const quote = (value: string) => encodeURIComponent(value);
  return (
    'MediaBrowser Client="Cinefern", Device="Cinefern", DeviceId="' +
    quote(deviceId) +
    '", Version="5.0.0"' +
    (token ? ', Token="' + quote(token) + '"' : '')
  );
}
class JellyfinError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401 || status === 403
        ? 'Jellyfin denied access. Check your account and sign in again in Providers → Jellyfin.'
        : 'Jellyfin returned HTTP ' +
            status +
            '. Check the server URL and try again.',
    );
  }
}
async function request<T>(
  transport: JellyfinTransport,
  session: Pick<JellyfinSession, 'serverUrl' | 'deviceId'> & {
    accessToken?: string;
  },
  path: string,
  query: Query = {},
  options: HttpOptions = {},
): Promise<T> {
  let response: HttpResponse;
  try {
    response = await transport(urlFor(session.serverUrl, path, query), {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
        Authorization: authorization(session.deviceId, session.accessToken),
      },
    });
  } catch {
    throw new Error(
      'Could not reach Jellyfin. Check the server address, network connection, and server certificate.',
    );
  }
  if (!response.ok) throw new JellyfinError(response.status);
  if (!response.body.trim()) return undefined as T;
  try {
    return JSON.parse(response.body) as T;
  } catch {
    throw new Error(
      'The server did not return Jellyfin data. Enter its server URL, including any base path.',
    );
  }
}

export async function authenticateJellyfin(
  transport: JellyfinTransport,
  serverUrl: string,
  username: string,
  password: string,
  deviceId: string,
): Promise<JellyfinSession> {
  serverUrl = normalizeJellyfinUrl(serverUrl);
  username = username.trim();
  if (!username) throw new Error('Enter your Jellyfin username.');
  const result = await request<{
    AccessToken?: string;
    User?: { Id?: string; Name?: string };
  }>(
    transport,
    { serverUrl, deviceId },
    'Users/AuthenticateByName',
    {},
    {
      method: 'POST',
      body: JSON.stringify({ Username: username, Pw: password }),
    },
  );
  if (
    typeof result?.AccessToken !== 'string' ||
    !result.AccessToken ||
    typeof result.User?.Id !== 'string' ||
    !result.User.Id
  )
    throw new Error(
      'Jellyfin did not return a user session. Check your account and try again.',
    );
  return {
    serverUrl,
    username:
      typeof result.User.Name === 'string' && result.User.Name
        ? result.User.Name
        : username,
    userId: result.User.Id,
    accessToken: result.AccessToken,
    deviceId,
  };
}
export async function logoutJellyfin(
  transport: JellyfinTransport,
  session: JellyfinSession,
) {
  await request(transport, session, 'Sessions/Logout', {}, { method: 'POST' });
}
export function jellyfinConfiguredManifest(
  settings: Record<string, SettingValue>,
): ProviderManifest {
  return {
    ...jellyfinManifest,
    permissions: {
      ...jellyfinManifest.permissions,
      network: settings.serverUrl
        ? [new URL(normalizeJellyfinUrl(String(settings.serverUrl))).origin]
        : [],
    },
  };
}

function language(code?: string): string {
  const value = (code ?? '').toLowerCase();
  return (
    (
      {
        eng: 'en',
        deu: 'de',
        ger: 'de',
        fra: 'fr',
        fre: 'fr',
        spa: 'es',
        ita: 'it',
        por: 'pt',
        jpn: 'ja',
        kor: 'ko',
        zho: 'zh',
        chi: 'zh',
        rus: 'ru',
        ara: 'ar',
        nld: 'nl',
        dut: 'nl',
      } as Record<string, string>
    )[value] ?? value
  );
}
function paging(cursor?: string, limit = 30) {
  const start = Number(cursor ?? 0);
  if (!Number.isSafeInteger(start) || start < 0)
    throw new Error('Invalid Jellyfin page.');
  return { start, limit: Math.min(100, Math.max(1, Math.trunc(limit) || 30)) };
}
function list(data: Items): Item[] {
  if (!data || !Array.isArray(data.Items))
    throw new Error('Jellyfin returned an invalid library.');
  return data.Items;
}
function nextPage(data: Items, start: number, limit: number) {
  const length = list(data).length;
  return length &&
    (typeof data.TotalRecordCount === 'number'
      ? start + length < data.TotalRecordCount
      : length === limit)
    ? String(start + length)
    : undefined;
}
function playbackProfile(preferences: PlaybackPreferences) {
  const height = Math.max(240, Math.min(2160, preferences.quality || 1080));
  const bitrate =
    height > 1080
      ? 40_000_000
      : height > 720
        ? 12_000_000
        : height > 480
          ? 5_000_000
          : 2_000_000;
  return {
    Name: 'Cinefern',
    MaxStreamingBitrate: bitrate,
    MaxStaticBitrate: bitrate,
    DirectPlayProfiles: [
      {
        Type: 'Video',
        Container: 'mp4,m4v,mov',
        VideoCodec: 'h264',
        AudioCodec: 'aac,mp3',
      },
    ],
    TranscodingProfiles: [
      {
        Type: 'Video',
        Container: 'ts',
        Protocol: 'hls',
        Context: 'Streaming',
        VideoCodec: 'h264',
        AudioCodec: 'aac',
        MaxAudioChannels: '2',
        MinSegments: 1,
        BreakOnNonKeyFrames: false,
      },
    ],
    CodecProfiles: [
      {
        Type: 'Video',
        Codec: 'h264',
        Conditions: [
          {
            Condition: 'LessThanEqual',
            Property: 'Height',
            Value: String(height),
            IsRequired: false,
          },
          {
            Condition: 'LessThanEqual',
            Property: 'VideoBitDepth',
            Value: '8',
            IsRequired: false,
          },
        ],
      },
      {
        Type: 'VideoAudio',
        Conditions: [
          {
            Condition: 'LessThanEqual',
            Property: 'AudioChannels',
            Value: '2',
            IsRequired: false,
          },
        ],
      },
    ],
    SubtitleProfiles: [{ Format: 'vtt', Method: 'External' }],
  };
}

export const jellyfinProvider = defineProvider({
  create(context) {
    const configured = !!(
      context.settings.serverUrl &&
      context.settings.userId &&
      context.settings.accessToken
    );
    const session: JellyfinSession = {
      serverUrl: configured
        ? normalizeJellyfinUrl(String(context.settings.serverUrl))
        : '',
      username: String(context.settings.username ?? ''),
      userId: String(context.settings.userId ?? ''),
      accessToken: String(context.settings.accessToken ?? ''),
      deviceId: String(context.settings.deviceId ?? ''),
    };
    function requireConnection() {
      if (!configured)
        throw new Error('Connect your server in Providers → Jellyfin.');
    }
    async function api<T>(
      path: string,
      query: Query = {},
      options: HttpOptions = {},
    ) {
      requireConnection();
      return request<T>(
        context.http.request,
        session,
        path,
        { userId: session.userId, ...query },
        options,
      );
    }
    function image(
      id: string | undefined,
      kind: string,
      tag?: string,
      width = 600,
    ) {
      if (!id || !tag) return undefined;
      // Jellyfin's tagged image endpoints are public. Never persist an access token in artwork/history.
      return urlFor(
        session.serverUrl,
        'Items/' + encodeURIComponent(id) + '/Images/' + kind,
        { tag, maxWidth: width },
      );
    }
    function person(value: NonNullable<Item['People']>[number]): Person {
      return {
        id: value.Id!,
        providerId: jellyfinManifest.id,
        name: value.Name || 'Unknown',
        role: value.Role,
        image: image(value.Id, 'Primary', value.PrimaryImageTag),
      };
    }
    function media(value: Item): MediaItem {
      if (!value.Id || !value.Name)
        throw new Error('Jellyfin returned an item without an ID or title.');
      const type: MediaType =
        value.Type === 'Series'
          ? 'series'
          : value.Type === 'Episode'
            ? 'episode'
            : value.Type === 'BoxSet' ||
                value.Type === 'CollectionFolder' ||
                value.Type === 'Folder'
              ? 'collection'
              : value.Type === 'Person'
                ? 'person'
                : 'movie';
      return {
        providerId: jellyfinManifest.id,
        id: value.Id,
        title: value.Name,
        type,
        overview: value.Overview,
        poster:
          image(value.Id, 'Primary', value.ImageTags?.Primary) ||
          image(value.SeriesId, 'Primary', value.SeriesPrimaryImageTag),
        backdrop:
          image(value.Id, 'Backdrop/0', value.BackdropImageTags?.[0], 1920) ||
          image(
            value.ParentBackdropItemId,
            'Backdrop/0',
            value.ParentBackdropImageTags?.[0],
            1920,
          ),
        year: value.ProductionYear,
        duration: value.RunTimeTicks
          ? value.RunTimeTicks / 10_000_000
          : undefined,
        rating: value.CommunityRating,
        genres: value.Genres,
        showId: value.SeriesId,
        season: value.ParentIndexNumber,
        episode: value.IndexNumber,
        cast: value.People?.filter((p) => p.Id && p.Name).map(person),
      };
    }
    async function item(id: string): Promise<Item> {
      // Querying by ID works across Jellyfin's old and new user-scoped item routes.
      const found = list(await api<Items>('Items', { ids: id, fields }))[0];
      if (!found)
        throw new Error(
          'This title is no longer available on your Jellyfin server.',
        );
      return found;
    }
    async function collection(
      id: string,
      title: string,
      cursor?: string,
      limit = 30,
      sort = 'title',
    ): Promise<Collection> {
      const page = paging(cursor, limit);
      const data = await api<Items>('Items', {
        parentId: id,
        recursive: true,
        includeItemTypes: 'Movie,Series,Video,BoxSet',
        fields,
        startIndex: page.start,
        limit: page.limit,
        enableTotalRecordCount: true,
        sortBy:
          sort === 'added'
            ? 'DateCreated,SortName'
            : sort === 'year'
              ? 'ProductionYear,SortName'
              : 'SortName',
        sortOrder: sort === 'title' ? 'Ascending' : 'Descending',
      });
      return {
        providerId: jellyfinManifest.id,
        id,
        title,
        items: list(data).map(media),
        nextCursor: nextPage(data, page.start, page.limit),
        sorting: [
          { id: 'title', label: 'Title' },
          { id: 'added', label: 'Recently added' },
          { id: 'year', label: 'Year' },
        ],
      };
    }
    function authenticatedUrl(path: string, query: Query = {}) {
      return urlFor(session.serverUrl, path, {
        ...query,
        api_key: session.accessToken,
      });
    }
    function transcodeUrl(value: string) {
      const base = new URL(session.serverUrl + '/');
      const url = new URL(value, base);
      if (url.origin !== base.origin || url.username || url.password)
        throw new Error(
          'Jellyfin returned a stream outside the configured server.',
        );
      // Some versions return /Videos/..., others include the reverse proxy's base path.
      if (base.pathname !== '/' && !url.pathname.startsWith(base.pathname))
        url.pathname =
          base.pathname.replace(/\/$/, '') +
          '/' +
          url.pathname.replace(/^\/+/, '');
      url.searchParams.set('api_key', session.accessToken);
      return url.href;
    }
    return {
      async getHome() {
        if (!configured) return { featured: [], collections: [] };
        let views: Items;
        try {
          views = await api<Items>('UserViews');
        } catch (error) {
          if (!(error instanceof JellyfinError) || error.status !== 404)
            throw error;
          views = await api<Items>(
            'Users/' + encodeURIComponent(session.userId) + '/Views',
          );
        }
        const libraries = list(views).filter(
          (v) =>
            v.Id &&
            (!v.CollectionType ||
              ['movies', 'tvshows', 'boxsets', 'homevideos'].includes(
                v.CollectionType,
              )),
        );
        const collections = await Promise.all(
          libraries.map((v) =>
            collection(
              v.Id!,
              v.Name || 'Jellyfin library',
              undefined,
              12,
              'added',
            ),
          ),
        );
        return {
          featured: collections
            .flatMap((c) => c.items)
            .filter((i) => i.type === 'movie' || i.type === 'series')
            .slice(0, 6),
          collections,
        };
      },
      async search(options) {
        if (!configured) return { items: [] };
        const page = paging(options.cursor, options.limit);
        const data = await api<Items>('Items', {
          searchTerm: options.query,
          recursive: true,
          fields,
          includeItemTypes: options.type
            ? types[options.type]
            : 'Movie,Series,Episode,BoxSet',
          startIndex: page.start,
          limit: page.limit,
          enableTotalRecordCount: true,
        });
        return {
          items: list(data).map(media),
          nextCursor: nextPage(data, page.start, page.limit),
        };
      },
      async getItem(id) {
        return media(await item(id));
      },
      async getCollection(id, options) {
        const metadata = await item(id);
        return collection(
          id,
          metadata.Name || 'Jellyfin library',
          options.cursor,
          options.limit,
          options.sort,
        );
      },
      async getSeasons(id) {
        const data = await api<Items>(
          'Shows/' + encodeURIComponent(id) + '/Seasons',
          { isMissing: false },
        );
        return list(data)
          .filter((s) => s.Id)
          .map((s) => ({
            id: s.Id!,
            title: s.Name || 'Season ' + s.IndexNumber,
            number: s.IndexNumber ?? 0,
            poster: image(s.Id, 'Primary', s.ImageTags?.Primary),
          }));
      },
      async getEpisodes(showId, seasonId) {
        const episodes: MediaItem[] = [];
        let cursor: string | undefined;
        do {
          const start = Number(cursor ?? 0);
          const data = await api<Items>(
            'Shows/' + encodeURIComponent(showId) + '/Episodes',
            {
              seasonId,
              isMissing: false,
              fields,
              startIndex: start,
              limit: 100,
              sortBy: 'ParentIndexNumber,IndexNumber',
            },
          );
          episodes.push(
            ...list(data).map((v) =>
              media({ ...v, SeriesId: v.SeriesId || showId }),
            ),
          );
          cursor = nextPage(data, start, 100);
          if (episodes.length > 10_000)
            throw new Error('This Jellyfin season contains too many episodes.');
        } while (cursor);
        return episodes;
      },
      async getPerson(id) {
        const [metadata, credits] = await Promise.all([
          item(id),
          api<Items>('Items', {
            personIds: id,
            recursive: true,
            includeItemTypes: 'Movie,Series',
            fields,
            limit: 100,
            sortBy: 'ProductionYear',
            sortOrder: 'Descending',
          }),
        ]);
        return {
          person: {
            id,
            providerId: jellyfinManifest.id,
            name: metadata.Name || 'Unknown',
            biography: metadata.Overview,
            image: image(id, 'Primary', metadata.ImageTags?.Primary),
          },
          credits: list(credits).map(media),
        };
      },
      async getSuggestions(id) {
        return list(
          await api<Items>('Items/' + encodeURIComponent(id) + '/Similar', {
            limit: 16,
            fields,
          }),
        ).map(media);
      },
      async getSources(id, preferences) {
        const profile = playbackProfile(preferences);
        const playback = (extra: Record<string, unknown> = {}) =>
          api<PlaybackInfo>(
            'Items/' + encodeURIComponent(id) + '/PlaybackInfo',
            {},
            {
              method: 'POST',
              body: JSON.stringify({
                UserId: session.userId,
                DeviceProfile: profile,
                MaxStreamingBitrate: profile.MaxStreamingBitrate,
                MaxAudioChannels: 2,
                SubtitleStreamIndex: -1,
                EnableDirectPlay: true,
                EnableDirectStream: true,
                EnableTranscoding: true,
                ...extra,
              }),
            },
          );
        const info = await playback();
        if (info.ErrorCode)
          throw new Error(
            'Jellyfin cannot play this title (' +
              info.ErrorCode +
              '). Check playback permissions on the server.',
          );
        const sources: MediaSource[] = [];
        for (let source of (info.MediaSources ?? []).slice(0, 10)) {
          if (!source.Id) continue;
          const preferredAudio = source.MediaStreams?.find(
            (s) =>
              s.Type === 'Audio' &&
              language(s.Language) === language(preferences.audioLanguage),
          );
          if (
            preferredAudio?.Index !== undefined &&
            preferredAudio.Index !== source.DefaultAudioStreamIndex
          ) {
            // Selecting a different track needs a server remux; a static MP4 keeps its original default track.
            const selected = await playback({
              MediaSourceId: source.Id,
              AudioStreamIndex: preferredAudio.Index,
              EnableDirectPlay: false,
            });
            const selectedSource = selected.MediaSources?.find(
              (s) => s.Id === source.Id,
            );
            if (selected.ErrorCode || !selectedSource)
              throw new Error(
                'Jellyfin could not select the requested audio track. Check transcoding permissions.',
              );
            source = selectedSource;
          }
          const streams = source.MediaStreams ?? [];
          const audio =
            streams.find(
              (s) =>
                s.Type === 'Audio' &&
                s.Index === source.DefaultAudioStreamIndex,
            ) ?? streams.find((s) => s.Type === 'Audio');
          const height = streams.find((s) => s.Type === 'Video')?.Height;
          const subtitles = streams
            .filter(
              (s) =>
                s.Type === 'Subtitle' &&
                s.IsTextSubtitleStream &&
                !s.IsExternalUrl &&
                s.Index !== undefined,
            )
            .map((s) => ({
              id: String(s.Index),
              label: s.DisplayTitle || s.Language || 'Subtitle',
              language: language(s.Language),
              format: 'vtt' as const,
              url: authenticatedUrl(
                'Videos/' +
                  encodeURIComponent(id) +
                  '/' +
                  encodeURIComponent(source.Id!) +
                  '/Subtitles/' +
                  s.Index +
                  '/Stream.vtt',
              ),
            }));
          const common = {
            audioLanguage: language(audio?.Language),
            subtitles,
            downloadable: false,
          };
          if (
            source.SupportsDirectPlay &&
            ['mp4', 'm4v', 'mov'].includes(source.Container ?? '')
          )
            sources.push({
              ...common,
              id: source.Id + ':direct',
              label: (source.Name || 'Original') + ' · Direct play',
              type: 'http',
              quality: height,
              url: authenticatedUrl(
                'Videos/' + encodeURIComponent(id) + '/stream',
                {
                  static: true,
                  mediaSourceId: source.Id,
                  deviceId: session.deviceId,
                },
              ),
            });
          if (source.TranscodingUrl)
            sources.push({
              ...common,
              id: source.Id + ':hls',
              label: (source.Name || 'Compatible') + ' · HLS',
              type: 'hls',
              quality: Math.min(
                height || preferences.quality,
                preferences.quality,
              ),
              url: transcodeUrl(source.TranscodingUrl),
            });
        }
        if (!sources.length)
          throw new Error(
            'Jellyfin has no compatible stream. Allow H.264/AAC transcoding for this user on the server.',
          );
        return sources;
      },
    };
  },
});
