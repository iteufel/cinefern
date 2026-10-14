import { defineProvider, type MediaItem } from '@cinefern/provider-sdk';

export default defineProvider({
  create(context) {
    const providerId = 'org.cinefern.media-research';
    const readItems = async (): Promise<MediaItem[]> =>
      JSON.parse((await context.storage.get('items')) ?? '[]');
    return {
      async search({ query, limit, cursor }) {
        if (cursor) return { items: [] };
        const status = await context.agent.status();
        if (!status.available) throw new Error(status.reason);
        const found = await context.agent.search({
          query,
          limit: Math.min(limit, 10),
        });
        const items: MediaItem[] = [];
        for (const match of found.items) {
          const item: MediaItem = {
            id: match.url,
            providerId,
            type: match.type,
            title: match.title,
            year: match.year,
            overview: match.overview,
            info: { 'Research source': match.url },
          };
          items.push(item);
        }
        const existing = await readItems();
        await context.storage.set(
          'items',
          JSON.stringify(
            [
              ...items,
              ...existing.filter(
                (saved) => !items.some((item) => item.id === saved.id),
              ),
            ].slice(0, 100),
          ),
        );
        return { items };
      },
      async getItem(id) {
        const items = await readItems();
        const item = items.find((entry) => entry.id === id);
        if (!item) throw new Error('Search for this title first.');
        if (!item.overview && (await context.agent.status()).available) {
          const resolved = await context.agent.resolve({
            url: id,
            context: item.title,
            instructions:
              'Read the source page and verify this title. Return a short factual synopsis in data.overview. Leave it empty if unavailable.',
          });
          if (typeof resolved.data.overview === 'string')
            item.overview = resolved.data.overview.slice(0, 2000);
          await context.storage.set('items', JSON.stringify(items));
        }
        return item;
      },
    };
  },
});
