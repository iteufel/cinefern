import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertSource,
  type HttpOptions,
  type HttpResponse,
  type MediaSource,
} from '@cinefern/provider-sdk';
import { ProviderRuntime } from '../src/core/runtime';
import { LibraryStore, type KeyValueStorage } from '../src/core/library';
import {
  JellyfinConnection,
  JELLYFIN_SESSION_KEY,
} from '../src/core/jellyfin-connection';
import {
  authenticateJellyfin,
  jellyfinConfiguredManifest,
  jellyfinManifest,
  jellyfinProvider,
  normalizeJellyfinUrl,
  type JellyfinTransport,
} from '../src/providers/jellyfin';

const server = 'https://media.example.com/jellyfin';
const settings = {
  serverUrl: server,
  username: 'Alice',
  userId: 'user-one',
  accessToken: 'test-session-token',
  deviceId: 'test-device',
};
const preferences = {
  quality: 1080,
  audioLanguage: 'en',
  subtitleLanguage: 'en',
};
function storage() {
  const values = new Map<string, string>();
  const disk: KeyValueStorage = {
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value) {
      values.set(key, value);
    },
    async remove(key) {
      values.delete(key);
    },
    async keys() {
      return [...values.keys()];
    },
  };
  return { disk, values };
}
function response(body: unknown, status = 200): HttpResponse {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {},
    body: JSON.stringify(body),
  };
}
async function provider(transport: JellyfinTransport, configured = true) {
  const runtime = new ProviderRuntime(storage().disk, transport);
  await runtime.register(
    jellyfinConfiguredManifest(configured ? settings : {}),
    jellyfinProvider,
    configured ? settings : {},
  );
  return runtime;
}
const movie = {
  Id: 'movie-one',
  Name: 'A film',
  Type: 'Movie',
  Overview: 'A story.',
  ProductionYear: 2025,
  RunTimeTicks: 90 * 60 * 10_000_000,
  CommunityRating: 8.3,
  Genres: ['Drama'],
  ImageTags: { Primary: 'poster-tag' },
  BackdropImageTags: ['backdrop-tag'],
  People: [
    {
      Id: 'person-one',
      Name: 'An actor',
      Role: 'Lead',
      PrimaryImageTag: 'actor-tag',
    },
  ],
};

test('Jellyfin URL validation preserves base paths and rejects ambiguous or credential-bearing addresses', () => {
  assert.equal(
    normalizeJellyfinUrl(' http://192.168.1.10:8096/ '),
    'http://192.168.1.10:8096',
  );
  assert.equal(normalizeJellyfinUrl(server + '///'), server);
  for (const url of [
    'media.example.com',
    'file:///media',
    'https://user:secret@media.example.com',
    server + '?api_key=secret',
    server + '#/web',
  ])
    assert.throws(() => normalizeJellyfinUrl(url));
  assert.deepEqual(jellyfinConfiguredManifest(settings).permissions.network, [
    'https://media.example.com',
  ]);
});

test('the included Jellyfin provider stays quiet until connected', async () => {
  const runtime = await provider(async () => {
    throw new Error('Must not access the network');
  }, false);
  assert.deepEqual(await runtime.call(jellyfinManifest.id, 'getHome'), {
    featured: [],
    collections: [],
  });
  assert.deepEqual(
    await runtime.call(jellyfinManifest.id, 'search', [
      { query: 'film', limit: 30 },
    ]),
    { items: [] },
  );
  await assert.rejects(
    runtime.call(jellyfinManifest.id, 'getSources', ['movie-one', preferences]),
    /Connect your server/,
  );
});

test('sign-in uses Jellyfin authentication, persists only a scoped session, and keeps failed reconnections atomic', async () => {
  const { disk, values } = storage();
  const devices: string[] = [];
  let fail = false;
  const connection = new JellyfinConnection(disk, async (url, options) => {
    assert.equal(url, server + '/Users/AuthenticateByName');
    assert.equal(options?.method, 'POST');
    assert.deepEqual(JSON.parse(options?.body ?? ''), {
      Username: 'Alice',
      Pw: 'a secret & password',
    });
    assert.ok(!url.includes('password'));
    assert.match(
      options?.headers?.Authorization ?? '',
      /^MediaBrowser Client="Cinefern"/,
    );
    assert.ok(!options?.headers?.Authorization?.includes('Token='));
    devices.push(
      /DeviceId="([^"]+)"/.exec(options!.headers!.Authorization!)![1]!,
    );
    return fail
      ? response({ message: 'Do not display server secrets' }, 401)
      : response({
          User: { Id: 'user-one', Name: 'Alice' },
          AccessToken: 'test-session-token',
        });
  });
  const inputs = {
    serverUrl: server + '/',
    username: ' Alice ',
    password: 'a secret & password',
  };
  const saved = await connection.connect(inputs);
  assert.deepEqual(saved, {
    serverUrl: server,
    username: 'Alice',
    userId: 'user-one',
  });
  assert.ok(!JSON.stringify([...values.values()]).includes(inputs.password));
  assert.equal(values.size, 1);
  assert.ok(values.has(JELLYFIN_SESSION_KEY));
  assert.equal(
    (await connection.restore(saved)).accessToken,
    'test-session-token',
  );
  assert.deepEqual(
    await connection.restore({
      ...saved,
      serverUrl: 'https://another.example.com',
    }),
    {},
  );
  assert.deepEqual(
    await connection.restore({ ...saved, userId: 'another-user' }),
    {},
  );
  const before = values.get(JELLYFIN_SESSION_KEY);
  fail = true;
  await assert.rejects(connection.connect(inputs), /denied access/);
  assert.equal(values.get(JELLYFIN_SESSION_KEY), before);
  assert.equal(devices[0], devices[1]);
});

test('disconnect and app reset remove the saved session; offline logout does not block sign-out', async () => {
  const { disk, values } = storage();
  await disk.set(JELLYFIN_SESSION_KEY, JSON.stringify(settings));
  let logout = false;
  const connection = new JellyfinConnection(disk, async (url, options) => {
    logout = true;
    assert.equal(url, server + '/Sessions/Logout');
    assert.equal(options?.method, 'POST');
    assert.match(
      options?.headers?.Authorization ?? '',
      /Token="test-session-token"/,
    );
    throw new Error('offline');
  });
  await connection.disconnect();
  assert.equal(logout, true);
  assert.equal(values.size, 0);
  await disk.set(JELLYFIN_SESSION_KEY, JSON.stringify(settings));
  const library = new LibraryStore(disk);
  await library.initialize();
  await library.reset();
  assert.equal(await disk.get(JELLYFIN_SESSION_KEY), null);
});

test('unreadable old credentials can be replaced by a new sign-in or removed', async () => {
  const { disk, values } = storage();
  const broken: KeyValueStorage = {
    ...disk,
    async get() {
      throw new Error('Old key cannot be decrypted');
    },
  };
  const connection = new JellyfinConnection(broken, async () =>
    response({
      User: { Id: 'user-one', Name: 'Alice' },
      AccessToken: 'replacement-token',
    }),
  );
  const saved = await connection.connect({
    serverUrl: server,
    username: 'Alice',
    password: '',
  });
  assert.equal(saved.userId, 'user-one');
  assert.equal(
    JSON.parse(values.get(JELLYFIN_SESSION_KEY)!).accessToken,
    'replacement-token',
  );
  await connection.disconnect();
  assert.equal(values.size, 0);
});

test('movies, library rows, details, collections and search use the configured base path and never store image credentials', async () => {
  const requests: URL[] = [];
  const runtime = await provider(async (address, options) => {
    const url = new URL(address);
    requests.push(url);
    assert.ok(url.pathname.startsWith('/jellyfin/'));
    assert.equal(url.searchParams.get('userId'), 'user-one');
    assert.match(
      options?.headers?.Authorization ?? '',
      /Token="test-session-token"/,
    );
    if (url.pathname.endsWith('/UserViews'))
      return response({
        Items: [
          { Id: 'movies', Name: 'My movies', CollectionType: 'movies' },
          { Id: 'music', Name: 'Music', CollectionType: 'music' },
        ],
      });
    assert.equal(url.pathname, '/jellyfin/Items');
    if (url.searchParams.get('ids') === 'movies')
      return response({
        Items: [{ Id: 'movies', Name: 'My movies', Type: 'CollectionFolder' }],
      });
    return response({
      Items: [movie],
      TotalRecordCount: url.searchParams.has('searchTerm') ? 4 : 1,
    });
  });
  const feed = await runtime.call<any>(jellyfinManifest.id, 'getHome');
  assert.equal(feed.collections.length, 1);
  assert.equal(feed.collections[0].title, 'My movies');
  const item = await runtime.call<any>(jellyfinManifest.id, 'getItem', [
    'movie-one',
  ]);
  assert.equal(item.duration, 5400);
  assert.equal(item.year, 2025);
  assert.equal(item.type, 'movie');
  assert.equal(item.cast[0].role, 'Lead');
  assert.equal(
    new URL(item.poster).pathname,
    '/jellyfin/Items/movie-one/Images/Primary',
  );
  assert.equal(new URL(item.backdrop).searchParams.get('tag'), 'backdrop-tag');
  assert.ok(!JSON.stringify(item).includes('test-session-token'));
  const page = await runtime.call<any>(jellyfinManifest.id, 'search', [
    { query: 'A & film', type: 'movie', cursor: '1', limit: 1 },
  ]);
  assert.equal(page.nextCursor, '2');
  assert.equal(requests.at(-1)?.searchParams.get('searchTerm'), 'A & film');
  assert.equal(
    requests.at(-1)?.searchParams.get('includeItemTypes'),
    'Movie,Video',
  );
  const collection = await runtime.call<any>(
    jellyfinManifest.id,
    'getCollection',
    ['movies', { limit: 30, sort: 'added' }],
  );
  assert.equal(collection.title, 'My movies');
  assert.equal(
    requests.at(-1)?.searchParams.get('sortBy'),
    'DateCreated,SortName',
  );
});

test('library discovery supports older Jellyfin view routes without hiding authentication errors', async () => {
  const runtime = await provider(async (address) => {
    const url = new URL(address);
    if (url.pathname.endsWith('/UserViews')) return response({}, 404);
    assert.equal(url.pathname, '/jellyfin/Users/user-one/Views');
    return response({ Items: [] });
  });
  assert.deepEqual(await runtime.call(jellyfinManifest.id, 'getHome'), {
    featured: [],
    collections: [],
  });
  let calls = 0;
  const expired = await provider(async () => {
    calls++;
    return response({}, 401);
  });
  await assert.rejects(
    expired.call(jellyfinManifest.id, 'getHome'),
    /sign in again/,
  );
  assert.equal(calls, 1);
});

test('series seasons and paginated episodes retain show identity and episode order', async () => {
  const runtime = await provider(async (address) => {
    const url = new URL(address);
    if (url.pathname.endsWith('/Seasons'))
      return response({
        Items: [{ Id: 'season-one', Name: 'Season 1', IndexNumber: 1 }],
      });
    assert.equal(url.pathname, '/jellyfin/Shows/show-one/Episodes');
    assert.equal(url.searchParams.get('seasonId'), 'season-one');
    assert.equal(url.searchParams.get('isMissing'), 'false');
    const start = Number(url.searchParams.get('startIndex'));
    return response({
      Items: Array.from({ length: start === 0 ? 100 : 2 }, (_, n) => ({
        Id: 'episode-' + (start + n + 1),
        Name: 'Episode ' + (start + n + 1),
        Type: 'Episode',
        ParentIndexNumber: 1,
        IndexNumber: start + n + 1,
        SeriesPrimaryImageTag: 'series-poster',
      })),
      TotalRecordCount: 102,
    });
  });
  const seasons = await runtime.call<any>(jellyfinManifest.id, 'getSeasons', [
    'show-one',
  ]);
  assert.equal(seasons[0].number, 1);
  const episodes = await runtime.call<any>(jellyfinManifest.id, 'getEpisodes', [
    'show-one',
    'season-one',
  ]);
  assert.equal(episodes.length, 102);
  assert.equal(episodes[101].episode, 102);
  assert.equal(episodes[0].type, 'episode');
  assert.equal(episodes[0].showId, 'show-one');
  assert.equal(
    new URL(episodes[0].poster).pathname,
    '/jellyfin/Items/show-one/Images/Primary',
  );
});

test('playback negotiates H.264/AAC, preserves proxy paths, selects audio and supplies authenticated VTT subtitles', async () => {
  const requests: Record<string, any>[] = [];
  const runtime = await provider(async (url, options) => {
    assert.equal(
      new URL(url).pathname,
      '/jellyfin/Items/movie-one/PlaybackInfo',
    );
    assert.equal(options?.method, 'POST');
    const body = JSON.parse(options?.body ?? '');
    requests.push(body);
    const selected = body.AudioStreamIndex === 2;
    return response({
      PlaySessionId: 'play-one',
      MediaSources: [
        {
          Id: 'version-one',
          Name: '1080p',
          Container: 'mkv',
          SupportsDirectPlay: false,
          TranscodingUrl:
            '/Videos/movie-one/master.m3u8?MediaSourceId=version-one&PlaySessionId=play-one',
          DefaultAudioStreamIndex: selected ? 2 : 1,
          MediaStreams: [
            { Type: 'Video', Height: 2160 },
            { Type: 'Audio', Index: 1, Language: 'deu' },
            { Type: 'Audio', Index: 2, Language: 'eng' },
            {
              Type: 'Subtitle',
              Index: 3,
              Language: 'eng',
              DisplayTitle: 'English',
              IsTextSubtitleStream: true,
            },
            {
              Type: 'Subtitle',
              Index: 4,
              Language: 'eng',
              IsTextSubtitleStream: false,
            },
            {
              Type: 'Subtitle',
              Index: 5,
              IsTextSubtitleStream: true,
              IsExternalUrl: true,
            },
          ],
        },
      ],
    });
  });
  const sources = await runtime.call<MediaSource[]>(
    jellyfinManifest.id,
    'getSources',
    ['movie-one', preferences],
  );
  assert.equal(sources.length, 1);
  const source = sources[0]!;
  assertSource(source);
  assert.equal(source.type, 'hls');
  assert.equal(source.audioLanguage, 'en');
  assert.equal(source.quality, 1080);
  assert.equal(source.downloadable, false);
  const url = new URL(source.url);
  assert.equal(url.pathname, '/jellyfin/Videos/movie-one/master.m3u8');
  assert.equal(url.searchParams.get('PlaySessionId'), 'play-one');
  assert.equal(url.searchParams.get('api_key'), settings.accessToken);
  assert.equal(source.subtitles?.length, 1);
  assert.equal(source.subtitles?.[0]?.language, 'en');
  assert.equal(
    new URL(source.subtitles![0]!.url).pathname,
    '/jellyfin/Videos/movie-one/version-one/Subtitles/3/Stream.vtt',
  );
  assert.equal(requests.length, 2);
  assert.equal(requests[1]!.EnableDirectPlay, false);
  assert.equal(requests[1]!.AudioStreamIndex, 2);
  assert.equal(
    requests[0]!.DeviceProfile.TranscodingProfiles[0].Protocol,
    'hls',
  );
  assert.equal(
    requests[0]!.DeviceProfile.TranscodingProfiles[0].VideoCodec,
    'h264',
  );
  assert.equal(
    requests[0]!.DeviceProfile.TranscodingProfiles[0].AudioCodec,
    'aac',
  );
});

test('compatible files use Jellyfin streaming endpoints, never server filesystem paths', async () => {
  const runtime = await provider(async () =>
    response({
      MediaSources: [
        {
          Id: 'direct-one',
          Path: '/private/server/file.mp4',
          Name: 'Original',
          Container: 'mp4',
          SupportsDirectPlay: true,
          DefaultAudioStreamIndex: 1,
          MediaStreams: [
            { Type: 'Video', Height: 720 },
            { Type: 'Audio', Index: 1, Language: 'eng' },
          ],
        },
      ],
    }),
  );
  const [source] = await runtime.call<MediaSource[]>(
    jellyfinManifest.id,
    'getSources',
    ['movie-one', preferences],
  );
  assert.equal(source?.type, 'http');
  const url = new URL(source!.url);
  assert.equal(url.pathname, '/jellyfin/Videos/movie-one/stream');
  assert.equal(url.searchParams.get('static'), 'true');
  assert.equal(url.searchParams.get('mediaSourceId'), 'direct-one');
  assert.ok(!source!.url.includes('/private/server'));
});

test('playback never forwards the session to another origin and reports denied or unavailable streams', async () => {
  for (const address of [
    'https://evil.example.com/master.m3u8',
    '//evil.example.com/master.m3u8',
    'https://user:password@media.example.com/master.m3u8',
  ]) {
    const runtime = await provider(async () =>
      response({ MediaSources: [{ Id: 'one', TranscodingUrl: address }] }),
    );
    await assert.rejects(
      runtime.call(jellyfinManifest.id, 'getSources', [
        'movie-one',
        preferences,
      ]),
      /outside the configured server/,
    );
  }
  const unavailable = await provider(async () =>
    response({ ErrorCode: 'NotAllowed' }),
  );
  await assert.rejects(
    unavailable.call(jellyfinManifest.id, 'getSources', [
      'movie-one',
      preferences,
    ]),
    /Check playback permissions/,
  );
  const empty = await provider(async () => response({ MediaSources: [] }));
  await assert.rejects(
    empty.call(jellyfinManifest.id, 'getSources', ['movie-one', preferences]),
    /no compatible stream/,
  );
});

test('connection errors are actionable and never echo passwords or server response bodies', async () => {
  for (const transport of [
    async () => response({ secret: 'sensitive-server-response' }, 403),
    async () => {
      throw new Error('sensitive-server-response');
    },
    async () => ({
      ...response({}),
      body: '<html>sensitive-server-response</html>',
    }),
  ]) {
    await assert.rejects(
      authenticateJellyfin(transport, server, 'Alice', 'password', 'device'),
      (error: Error) => {
        assert.ok(!error.message.includes('sensitive-server-response'));
        assert.ok(!error.message.includes('password'));
        return true;
      },
    );
  }
});
