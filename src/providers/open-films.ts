import {
  defineProvider,
  type Collection,
  type MediaItem,
  type MediaSource,
  type ProviderManifest,
} from '@cinefern/provider-sdk';

const providerId = 'io.github.iteufel.cinefern.open-films';
export const openFilmsManifest: ProviderManifest = {
  id: providerId,
  name: 'Open Cinema',
  version: '1.0.0',
  apiVersion: 1,
  description:
    'Stories made in the open. A curated collection of freely available Blender open films.',
  author: 'Cinefern',
  homepage: 'https://studio.blender.org/films/',
  color: '#93cbb6',
  capabilities: [
    'browse',
    'search',
    'sources',
    'series',
    'collections',
    'people',
    'trailers',
    'resolve',
  ],
  permissions: {
    network: [
      'https://download.blender.org',
      'https://media.w3.org',
      'https://storage.googleapis.com',
      'https://test-streams.mux.dev',
      'https://demo.unified-streaming.com',
    ],
    storage: false,
  },
};
const films: MediaItem[] = [
  {
    id: 'sintel',
    providerId,
    type: 'movie',
    title: 'Sintel',
    year: 2010,
    duration: 888,
    overview:
      'A young woman follows a mysterious trail through a world of mountains and dragons, searching for the companion she lost. An independent fantasy short from the Blender Foundation.',
    genres: ['Fantasy', 'Adventure', 'Animation'],
    poster: 'asset:sintel-poster',
    backdrop: 'asset:sintel-backdrop',
    cast: [
      { providerId, id: 'colin-levy', name: 'Colin Levy', role: 'Director' },
      { providerId, id: 'halina-reijn', name: 'Halina Reijn', role: 'Sintel' },
    ],
    info: {
      Studio: 'Blender Foundation',
      License: 'Creative Commons Attribution 3.0',
      Language: 'English',
    },
  },
  {
    id: 'big-buck-bunny',
    providerId,
    type: 'movie',
    title: 'Big Buck Bunny',
    year: 2008,
    duration: 596,
    overview:
      'A gentle giant of a rabbit has had enough of three woodland bullies. A bright, playful open film about finding a little peace in the forest.',
    genres: ['Comedy', 'Animation', 'Family'],
    poster: 'asset:bunny',
    backdrop: 'asset:bunny',
    cast: [
      {
        providerId,
        id: 'sacha-goedegebure',
        name: 'Sacha Goedegebure',
        role: 'Director',
      },
    ],
    info: {
      Studio: 'Blender Foundation',
      License: 'Creative Commons Attribution 3.0',
    },
  },
  {
    id: 'elephants-dream',
    providerId,
    type: 'movie',
    title: 'Elephants Dream',
    year: 2006,
    duration: 653,
    overview:
      'Two unlikely companions explore a strange mechanical world. The first Blender open movie turns a journey through machinery into a story about imagination.',
    genres: ['Sci-Fi', 'Animation', 'Drama'],
    poster: 'asset:elephants',
    backdrop: 'asset:elephants',
    cast: [
      {
        providerId,
        id: 'bassam-kurdali',
        name: 'Bassam Kurdali',
        role: 'Director',
      },
    ],
    info: {
      Studio: 'Blender Foundation',
      License: 'Creative Commons Attribution 2.5',
    },
  },
  {
    id: 'tears-of-steel',
    providerId,
    type: 'movie',
    title: 'Tears of Steel',
    year: 2012,
    duration: 734,
    overview:
      'In a future Amsterdam, a group of scientists and soldiers gather to stage a pivotal event from the past, hoping to rescue the world from destructive robots.',
    genres: ['Sci-Fi', 'Action', 'Drama'],
    poster: 'asset:tears',
    backdrop: 'asset:tears',
    cast: [
      { providerId, id: 'ian-hubert', name: 'Ian Hubert', role: 'Director' },
    ],
    info: {
      Studio: 'Blender Foundation',
      License: 'Creative Commons Attribution 3.0',
    },
  },
];
const streams: Record<string, MediaSource[]> = {
  sintel: [
    {
      id: 'dash',
      label: 'Adaptive • DASH',
      type: 'dash',
      url: 'https://storage.googleapis.com/shaka-demo-assets/sintel/dash.mpd',
      quality: 1080,
      audioLanguage: 'en',
    },
  ],
  'big-buck-bunny': [
    {
      id: 'hls',
      label: 'Adaptive • HLS',
      type: 'hls',
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      quality: 1080,
    },
    {
      id: 'file',
      label: 'Original • File',
      type: 'http',
      url: 'https://media.w3.org/2010/05/bunny/movie.mp4',
      quality: 480,
      downloadable: true,
    },
  ],
  'elephants-dream': [
    {
      id: 'file',
      label: 'Original • 720p',
      type: 'http',
      url: 'https://download.blender.org/ED/elephantsdream-720-h264-st-aac.mov',
      quality: 720,
      audioLanguage: 'en',
      downloadable: true,
    },
  ],
  'tears-of-steel': [
    {
      id: 'hls',
      label: 'Adaptive • HLS',
      type: 'hls',
      url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
      quality: 1080,
      audioLanguage: 'en',
    },
    {
      id: 'dash',
      label: 'Adaptive • DASH',
      type: 'dash',
      url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.mpd',
      quality: 1080,
      audioLanguage: 'en',
    },
  ],
};
const anthology: MediaItem = {
  id: 'open-film-anthology',
  providerId,
  type: 'series',
  title: 'The Open Film Anthology',
  overview:
    'Watch the evolution of open filmmaking, one story at a time. Two curated seasons bring together the early classics and bold new worlds.',
  year: 2006,
  genres: ['Anthology', 'Animation'],
  poster: 'asset:elephants',
  backdrop: 'asset:tears',
};
const collections: Collection[] = [
  {
    providerId,
    id: 'open-classics',
    title: 'A little wonder, a lot of imagination',
    description: 'Independent worlds. Extraordinary stories.',
    items: films,
  },
  {
    providerId,
    id: 'new-worlds',
    title: 'Step into another world',
    description: 'Fantasy and science fiction from open cinema.',
    items: [films[0]!, films[2]!, films[3]!, anthology],
  },
  {
    providerId,
    id: 'family',
    title: 'Made for a movie night',
    description: 'Short stories with a big heart.',
    items: [films[1]!, films[0]!, anthology],
  },
];
function sources(id: string): MediaSource[] {
  const filmId = id.startsWith('ep-') ? id.slice(3) : id;
  if (!streams[filmId]) throw new Error('This film has no playable source.');
  return streams[filmId]!;
}
export const openFilmsProvider = defineProvider({
  create: () => ({
    async getHome() {
      return { featured: [films[0]!, films[3]!, films[1]!], collections };
    },
    async search(options) {
      const items = [...films, anthology].filter(
        (f) =>
          (!options.type || f.type === options.type) &&
          (f.title + ' ' + f.overview + ' ' + f.genres?.join(' '))
            .toLowerCase()
            .includes(options.query.toLowerCase()),
      );
      const offset = Number(options.cursor || 0);
      return {
        items: items.slice(offset, offset + options.limit),
        nextCursor:
          offset + options.limit < items.length
            ? String(offset + options.limit)
            : undefined,
      };
    },
    async getItem(id) {
      if (id === anthology.id) return anthology;
      const film = films.find(
        (f) => f.id === (id.startsWith('ep-') ? id.slice(3) : id),
      );
      if (!film) throw new Error('Film not found.');
      if (id.startsWith('ep-'))
        return {
          ...film,
          id,
          type: 'episode',
          showId: anthology.id,
          season: ['elephants-dream', 'big-buck-bunny'].includes(film.id)
            ? 1
            : 2,
          episode: (films.indexOf(film) % 2) + 1,
        };
      return film;
    },
    async getCollection(id, options) {
      const collection = collections.find((c) => c.id === id);
      if (!collection) throw new Error('Collection not found.');
      const items = [...collection.items];
      if (options.sort === 'title')
        items.sort((a, b) => a.title.localeCompare(b.title));
      if (options.sort === 'year')
        items.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
      return {
        ...collection,
        items,
        sorting: [
          { id: 'featured', label: 'Featured' },
          { id: 'title', label: 'Title' },
          { id: 'year', label: 'Newest' },
        ],
      };
    },
    async getSeasons() {
      return [
        { id: 'classics', number: 1, title: 'The early classics' },
        { id: 'worlds', number: 2, title: 'New worlds' },
      ];
    },
    async getEpisodes(showId, seasonId) {
      if (showId !== anthology.id) throw new Error('Series not found.');
      const ids =
        seasonId === 'classics'
          ? ['elephants-dream', 'big-buck-bunny']
          : ['sintel', 'tears-of-steel'];
      return ids.map((id, i) => ({
        ...films.find((f) => f.id === id)!,
        id: 'ep-' + id,
        type: 'episode' as const,
        showId,
        season: seasonId === 'classics' ? 1 : 2,
        episode: i + 1,
      }));
    },
    async getSources(id) {
      return sources(id);
    },
    async getTrailer(id) {
      // Providers can expose a separate trailer. These open films use a short excerpt.
      if (id === 'sintel')
        return {
          id: 'preview',
          label: 'Official trailer',
          type: 'http',
          url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
        };
      return { ...sources(id)[0]!, id: 'preview', label: 'Film preview' };
    },
    async getSuggestions(id) {
      return films.filter((f) => f.id !== id);
    },
    async getPerson(id) {
      const person = films
        .flatMap((f) => f.cast ?? [])
        .find((p) => p.id === id);
      if (!person) throw new Error('Person not found.');
      return {
        person,
        credits: films.filter((f) => f.cast?.some((p) => p.id === id)),
      };
    },
    async resolve(url) {
      if (!/\.(mp4|webm|m3u8|mpd)(?:[?#]|$)/i.test(url)) return null;
      return {
        id: 'direct',
        label: 'Direct stream',
        url,
        type: /\.m3u8(?:[?#]|$)/i.test(url)
          ? 'hls'
          : /\.mpd(?:[?#]|$)/i.test(url)
            ? 'dash'
            : 'http',
      };
    },
  }),
});
