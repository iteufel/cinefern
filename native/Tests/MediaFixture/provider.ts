import { defineProvider } from '@cinefern/provider-sdk';
// Synthetic media only. No real service, account or credential is used by this fixture.
const item = {
  providerId: 'org.cinefern.transport-fixture',
  id: 'transport',
  title: 'Cinefern Transport Fixture',
  type: 'movie' as const,
  overview: 'Local authenticated media, two audio tracks and subtitles.',
};
export default defineProvider({
  create(context) {
    const root = String(context.settings.root || 'http://127.0.0.1:42187');
    const headers = {
      Authorization: 'Bearer cinefern-local-test',
      'X-Cinefern-Fixture': 'required',
    };
    return {
      async getHome() {
        return {
          featured: [item],
          collections: [
            {
              id: 'all',
              providerId: item.providerId,
              title: 'Native media checks',
              items: [item],
            },
          ],
        };
      },
      async getItem() {
        return item;
      },
      async getSources() {
        return [
          {
            id: 'hls',
            url: root + '/media/hls/master.m3u8',
            type: 'hls' as const,
            label: 'Authenticated HLS (AES-128)',
            quality: 1080,
            headers,
          },
          {
            id: 'mkv',
            url: root + '/media/multi.mkv',
            type: 'http' as const,
            label: 'VLC: two audio tracks + subtitles',
            quality: 720,
            headers,
          },
          {
            id: 'mp4',
            url: root + '/media/multi.mp4',
            type: 'http' as const,
            label: 'Authenticated MP4',
            quality: 480,
            headers,
          },
          {
            id: 'dash',
            url: root + '/media/dash/manifest.mpd',
            type: 'dash' as const,
            label: 'Authenticated DASH',
            quality: 2160,
            headers,
          },
        ];
      },
    };
  },
});
