import {
  defineProvider,
  type MediaItem,
  type MediaSource,
} from '@cinefern/provider-sdk';
import manifest from './manifest.json';

interface CatalogItem extends MediaItem {
  sources: MediaSource[];
}
export default defineProvider({
  create(context) {
    async function items(): Promise<CatalogItem[]> {
      const response = await context.http.request(
        String(context.settings.catalogUrl),
        {
          headers: context.settings.token
            ? { Authorization: 'Bearer ' + String(context.settings.token) }
            : {},
        },
      );
      if (!response.ok)
        throw new Error('Catalog returned HTTP ' + response.status);
      const catalog = JSON.parse(response.body) as { items: CatalogItem[] };
      return catalog.items.map((item) => ({
        ...item,
        providerId: manifest.id,
      }));
    }
    return {
      async getHome() {
        const all = await items();
        return {
          featured: all.slice(0, 3),
          collections: [
            {
              id: 'all',
              providerId: manifest.id,
              title: 'My catalog',
              items: all,
            },
          ],
        };
      },
      async search({ query, cursor, limit, type }) {
        const matches = (await items()).filter(
          (item) =>
            item.title.toLowerCase().includes(query.toLowerCase()) &&
            (!type || item.type === type),
        );
        const offset = Number(cursor || 0);
        return {
          items: matches.slice(offset, offset + limit),
          nextCursor:
            offset + limit < matches.length
              ? String(offset + limit)
              : undefined,
        };
      },
      async getItem(id) {
        const item = (await items()).find((item) => item.id === id);
        if (!item) throw new Error('Media not found.');
        return item;
      },
      async getSources(id) {
        const item = (await items()).find((item) => item.id === id);
        return item?.sources ?? [];
      },
    };
  },
});
