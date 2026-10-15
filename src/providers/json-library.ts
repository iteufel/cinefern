import {
  defineProvider,
  type MediaItem,
  type MediaSource,
  type ProviderManifest,
  type HomeFeed,
} from '@cinefern/provider-sdk';
import { JSON_LIBRARY_PROVIDER_ID } from './ids';

export const jsonLibraryManifest: ProviderManifest = {
  id: JSON_LIBRARY_PROVIDER_ID,
  name: 'Your Library',
  version: '1.0.0',
  apiVersion: 1,
  description:
    'Connect a JSON catalog on your own server. Add its origin as a provider permission when creating your bundle.',
  author: 'Cinefern',
  color: '#9ea6ec',
  capabilities: ['browse', 'search', 'sources', 'collections'],
  permissions: { network: [], storage: true },
  settings: [
    {
      id: 'catalogUrl',
      label: 'Catalog URL',
      type: 'text',
      description: 'A JSON catalog served by your media library.',
    },
  ],
};
export interface JsonCatalog {
  items: Array<MediaItem & { sources?: MediaSource[] }>;
  collections?: Array<{ id: string; title: string; itemIds: string[] }>;
}
export const jsonLibraryProvider = defineProvider({
  create(context) {
    async function catalog(): Promise<JsonCatalog> {
      const url = String(context.settings.catalogUrl || '');
      if (!url) return { items: [] };
      const response = await context.http.request(url);
      if (!response.ok)
        throw new Error(
          'Could not load catalog (HTTP ' + response.status + ').',
        );
      const data = JSON.parse(response.body) as JsonCatalog;
      if (!Array.isArray(data.items))
        throw new Error('Catalog must contain an items array.');
      return {
        ...data,
        items: data.items.map((item) => ({
          ...item,
          providerId: jsonLibraryManifest.id,
        })),
      };
    }
    async function home(): Promise<HomeFeed> {
      const data = await catalog();
      return {
        featured: data.items.slice(0, 3),
        collections: data.collections?.map((c) => ({
          providerId: jsonLibraryManifest.id,
          id: c.id,
          title: c.title,
          items: data.items.filter((item) => c.itemIds.includes(item.id)),
        })) ?? [
          {
            providerId: jsonLibraryManifest.id,
            id: 'all',
            title: 'Your media',
            items: data.items,
          },
        ],
      };
    }
    return {
      getHome: home,
      async getItem(id) {
        const item = (await catalog()).items.find((i) => i.id === id);
        if (!item) throw new Error('Media not found in your catalog.');
        return item;
      },
      async search(options) {
        const items = (await catalog()).items.filter(
          (i) =>
            i.title.toLowerCase().includes(options.query.toLowerCase()) &&
            (!options.type || i.type === options.type),
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
      async getSources(id) {
        const item = (await catalog()).items.find((i) => i.id === id);
        return item?.sources ?? [];
      },
      async getCollection(id, options) {
        const collection = (await home()).collections.find((c) => c.id === id);
        if (!collection) throw new Error('Collection not found.');
        if (options.sort === 'title')
          collection.items.sort((a, b) => a.title.localeCompare(b.title));
        const offset = Number(options.cursor || 0);
        return {
          ...collection,
          items: collection.items.slice(offset, offset + options.limit),
          nextCursor:
            offset + options.limit < collection.items.length
              ? String(offset + options.limit)
              : undefined,
        };
      },
    };
  },
});
