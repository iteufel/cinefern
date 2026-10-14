import { Pressable } from '../ui/focus';
import React, { useEffect, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Compass,
  Film,
  Layers,
  Play,
  Search,
  Tv,
} from 'lucide-react-native';
import {
  mediaKey,
  type Collection,
  type HomeFeed,
  type MediaItem,
  type MediaPage,
  type MediaType,
  type Person,
} from '@cinefern/provider-sdk';
import { useApp } from '../app-context';
import { continueWatching } from '../core/library';
import {
  Button,
  Chip,
  Empty,
  Failure,
  Input,
  Loading,
  MediaGrid,
  MediaRow,
  PageHeader,
  SectionHeader,
  styles as ui,
} from '../ui/components';
import { useContentWidth } from '../ui/shell';
import { colors, isTV, textSize } from '../ui/theme';
import { useT } from '../ui/i18n';
import { useAsync } from '../ui/use-async';
import { imageSource } from '../ui/artwork';

function visible(item: MediaItem, showAdult: boolean) {
  return showAdult || !item.adult;
}
export function HomeScreen() {
  const app = useApp();
  const t = useT();
  const { width } = useWindowDimensions();
  const route =
    app.route.name === 'home' ? app.route : { name: 'home' as const };
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const records = app.runtime
    .all()
    .filter(
      (record) =>
        (!route.providerId || record.manifest.id === route.providerId) &&
        record.manifest.capabilities.includes('browse') &&
        (app.state.settings.showAdult || !record.manifest.adult),
    );
  const query = useAsync(
    'home:' + app.providerRevision + ':' + route.providerId,
    async () => {
      const results = await Promise.allSettled(
        records.map((record) =>
          app.runtime.call<HomeFeed>(record.manifest.id, 'getHome', [], true),
        ),
      );
      const feeds: HomeFeed[] = [];
      const failures: string[] = [];
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') feeds.push(result.value);
        else
          failures.push(
            records[index]!.manifest.name + ': ' + String(result.reason),
          );
      });
      if (!feeds.length && failures.length)
        throw new Error(failures.join('\n'));
      return {
        featured: feeds.flatMap((feed) => feed.featured),
        collections: feeds.flatMap((feed) => feed.collections),
        failures,
      };
    },
  );
  useEffect(() => setFeaturedIndex(0), [route.providerId]);
  const filter = (item: MediaItem) =>
    visible(item, app.state.settings.showAdult) &&
    (!route.filter || item.type === route.filter);
  const featured = query.data?.featured.filter(filter) ?? [];
  const hero = featured[featuredIndex % Math.max(1, featured.length)];
  const collections =
    query.data?.collections
      .map((c) => ({ ...c, items: c.items.filter(filter) }))
      .filter((c) => c.items.length) ?? [];
  const continuing = continueWatching(app.state.history).filter(
    (entry) =>
      (!route.providerId || entry.item.providerId === route.providerId) &&
      filter(entry.item),
  );
  return (
    <>
      <PageHeader
        title={
          route.providerId
            ? (app.manifests.find((m) => m.id === route.providerId)?.name ??
              t.discover)
            : route.filter === 'movie'
              ? t.movies
              : route.filter === 'series'
                ? t.series
                : t.discover
        }
        eyebrow="THE GOOD PART STARTS HERE"
        action={
          <View style={s.connection}>
            <View style={s.dot} />
            <Text style={s.connectionText}>
              {records.length} {records.length === 1 ? 'provider' : 'providers'}{' '}
              connected
            </Text>
          </View>
        }
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 9, marginBottom: 24 }}
      >
        <Chip
          selected={!route.filter}
          onPress={() =>
            app.navigate({ name: 'home', providerId: route.providerId })
          }
        >
          For you
        </Chip>
        <Chip
          selected={route.filter === 'movie'}
          onPress={() =>
            app.navigate({
              name: 'home',
              filter: 'movie',
              providerId: route.providerId,
            })
          }
        >
          {t.movies}
        </Chip>
        <Chip
          selected={route.filter === 'series'}
          onPress={() =>
            app.navigate({
              name: 'home',
              filter: 'series',
              providerId: route.providerId,
            })
          }
        >
          {t.series}
        </Chip>
        {route.providerId && (
          <Chip onPress={() => app.navigate({ name: 'home' })}>
            {t.allProviders}
          </Chip>
        )}
        {isTV &&
          app.runtime
            .all()
            .filter((p) => !p.manifest.adult || app.state.settings.showAdult)
            .map((p) => (
              <Chip
                key={p.manifest.id}
                selected={route.providerId === p.manifest.id}
                onPress={() =>
                  app.navigate({
                    name: 'home',
                    providerId: p.manifest.id,
                    filter: route.filter,
                  })
                }
              >
                {p.manifest.name}
              </Chip>
            ))}
      </ScrollView>
      {query.loading ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} retry={query.retry} />
      ) : (
        <>
          {hero && (
            <View style={[s.hero, { minHeight: width < 820 ? 390 : 370 }]}>
              <Image
                source={imageSource(hero.backdrop || hero.poster)}
                style={[
                  StyleSheet.absoluteFill,
                  { width: '100%', height: '100%' },
                ]}
                resizeMode="cover"
              />
              <LinearGradient
                colors={
                  app.state.settings.vibrancy
                    ? ['#0a121bf5', '#0a121bad', '#0a121b18']
                    : ['#0a121bc5', '#0a121bc5']
                }
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient
                colors={['#0a121b00', '#0a121be8']}
                style={StyleSheet.absoluteFill}
              />
              <View style={[s.heroContent, { padding: width < 820 ? 25 : 36 }]}>
                <View style={s.heroEyebrow}>
                  <View
                    style={{
                      width: 18,
                      height: 1,
                      backgroundColor: colors.accent,
                    }}
                  />
                  <Text style={ui.eyebrow}>IN THE SPOTLIGHT</Text>
                </View>
                <Text
                  style={[
                    s.heroTitle,
                    width < 820 && { fontSize: textSize(43) },
                  ]}
                >
                  {hero.title}
                </Text>
                <Text style={s.heroMeta}>
                  {[
                    hero.year,
                    hero.genres?.slice(0, 2).join(' / '),
                    hero.duration && Math.round(hero.duration / 60) + ' min',
                  ]
                    .filter(Boolean)
                    .join('   ·   ')}
                </Text>
                <Text style={s.heroDescription} numberOfLines={3}>
                  {hero.overview}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 10,
                    marginTop: 23,
                  }}
                >
                  <Button
                    icon={Play}
                    variant="primary"
                    disabled={app.playingLoading}
                    onPress={() =>
                      hero.type === 'series'
                        ? app.navigate({ name: 'item', item: hero })
                        : void app.play(hero)
                    }
                  >
                    {t.play}
                  </Button>
                  <Button
                    icon={app.library.isSaved(hero) ? Check : Bookmark}
                    onPress={() => app.toggleSave(hero)}
                    style={{
                      backgroundColor: '#15232ab0',
                      borderColor: '#61716c70',
                    }}
                  >
                    {app.library.isSaved(hero) ? t.saved : t.save}
                  </Button>
                  <Button
                    variant="ghost"
                    onPress={() => app.navigate({ name: 'item', item: hero })}
                  >
                    {t.details}
                  </Button>
                </View>
              </View>
              {featured.length > 1 && (
                <View style={s.heroPagination}>
                  {featured.map((item, index) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={'Feature ' + item.title}
                      key={mediaKey(item)}
                      onPress={() => setFeaturedIndex(index)}
                      style={[
                        s.pageDot,
                        featuredIndex === index && {
                          backgroundColor: colors.accent,
                          width: 23,
                        },
                      ]}
                    />
                  ))}
                </View>
              )}
            </View>
          )}
          <View style={s.editorialLine}>
            <Text style={s.editorialText}>LESS SCROLLING. MORE STORIES.</Text>
            <View
              style={{ height: 1, backgroundColor: colors.border, flex: 1 }}
            />
            <Compass size={14} color={colors.subtle} />
          </View>
          <MediaRow
            title={t.continue}
            subtitle="Pick up right where you left off."
            items={continuing.map((e) => e.item)}
            landscape
            progress={(item) => {
              const entry = app.library.progress(item);
              return entry && entry.position / entry.duration;
            }}
          />
          {!!query.data?.failures.length && (
            <Text
              style={{
                color: colors.warning,
                fontSize: textSize(12),
                marginBottom: 18,
              }}
            >
              {query.data.failures.join('\n')}
            </Text>
          )}
          {collections.map((collection) => (
            <MediaRow
              key={collection.providerId + ':' + collection.id}
              title={collection.title}
              subtitle={collection.description}
              items={collection.items}
              action={
                app.runtime
                  .get(collection.providerId)
                  .manifest.capabilities.includes('collections') && (
                  <Button
                    icon={ArrowRight}
                    compact
                    variant="ghost"
                    onPress={() =>
                      app.navigate({
                        name: 'collection',
                        providerId: collection.providerId,
                        id: collection.id,
                        title: collection.title,
                      })
                    }
                  >
                    {width >= 820 ? t.seeAll : undefined}
                  </Button>
                )
              }
            />
          ))}
          {!hero && !collections.length && (
            <Empty
              icon={route.filter === 'series' ? Tv : Film}
              title={
                records.length
                  ? 'A blank canvas for your library'
                  : 'Bring your favorite provider'
              }
              description={
                records.length
                  ? 'This provider has no titles in this view. Connect a catalog or explore another provider.'
                  : 'Install a TypeScript media provider to start exploring.'
              }
              action={
                <Button
                  icon={Layers}
                  onPress={() => app.navigate({ name: 'providers' })}
                >
                  {t.providers}
                </Button>
              }
            />
          )}
        </>
      )}
    </>
  );
}
export function SearchScreen() {
  const app = useApp();
  const t = useT();
  const contentWidth = useContentWidth();
  const [debounced, setDebounced] = useState(app.searchQuery);
  const [providerId, setProviderId] = useState('');
  const [type, setType] = useState<MediaType | undefined>();
  const [more, setMore] = useState<MediaItem[]>([]);
  const [cursors, setCursors] = useState<Record<string, string>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(app.searchQuery.trim()), 350);
    return () => clearTimeout(timer);
  }, [app.searchQuery]);
  const records = app.runtime
    .all()
    .filter(
      (p) =>
        p.manifest.capabilities.includes('search') &&
        (!providerId || p.manifest.id === providerId) &&
        (!p.manifest.adult || app.state.settings.showAdult),
    );
  const key = JSON.stringify([
    'search',
    app.providerRevision,
    debounced,
    providerId,
    type,
  ]);
  const query = useAsync(key, async () => {
    if (!debounced)
      return {
        items: [] as MediaItem[],
        cursors: {} as Record<string, string>,
        failures: [] as string[],
      };
    const results = await Promise.allSettled(
      records.map((p) =>
        app.runtime.call<MediaPage>(
          p.manifest.id,
          'search',
          [{ query: debounced, type, limit: 24 }],
          true,
        ),
      ),
    );
    const items: MediaItem[] = [];
    const cursors: Record<string, string> = {};
    const failures: string[] = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        items.push(...result.value.items);
        if (result.value.nextCursor)
          cursors[records[i]!.manifest.id] = result.value.nextCursor;
      } else
        failures.push(records[i]!.manifest.name + ': ' + String(result.reason));
    });
    return {
      items: items.filter((i) => visible(i, app.state.settings.showAdult)),
      cursors,
      failures,
    };
  });
  useEffect(() => {
    setMore([]);
    setCursors(query.data?.cursors ?? {});
  }, [key, query.data]);
  async function loadMore() {
    setLoadingMore(true);
    try {
      const pages = await Promise.all(
        Object.entries(cursors).map(async ([id, cursor]) => ({
          id,
          page: await app.runtime.call<MediaPage>(id, 'search', [
            { query: debounced, type, limit: 24, cursor },
          ]),
        })),
      );
      setMore((items) => [
        ...items,
        ...pages
          .flatMap((p) => p.page.items)
          .filter((i) => visible(i, app.state.settings.showAdult)),
      ]);
      setCursors(
        Object.fromEntries(
          pages
            .filter((p) => p.page.nextCursor)
            .map((p) => [p.id, p.page.nextCursor!]),
        ),
      );
    } catch (error) {
      app.notify(String(error));
    } finally {
      setLoadingMore(false);
    }
  }
  const items = [...(query.data?.items ?? []), ...more].filter(
    (item, i, all) =>
      all.findIndex((e) => mediaKey(e) === mediaKey(item)) === i,
  );
  return (
    <>
      <PageHeader
        title={t.search}
        eyebrow="FOLLOW YOUR CURIOSITY"
        description="One search. Every connected provider."
      />
      <Input
        value={app.searchQuery}
        onChange={app.setSearchQuery}
        placeholder={t.searchPlaceholder}
        icon={Search}
        style={{ marginBottom: 18 }}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 9, marginBottom: 12 }}
      >
        <Chip selected={!providerId} onPress={() => setProviderId('')}>
          {t.allProviders}
        </Chip>
        {app.runtime
          .all()
          .filter((p) => p.manifest.capabilities.includes('search'))
          .map((p) => (
            <Chip
              key={p.manifest.id}
              selected={providerId === p.manifest.id}
              onPress={() => setProviderId(p.manifest.id)}
            >
              {p.manifest.name}
            </Chip>
          ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 9, marginBottom: 28 }}>
        <Chip selected={!type} onPress={() => setType(undefined)}>
          All titles
        </Chip>
        <Chip selected={type === 'movie'} onPress={() => setType('movie')}>
          {t.movies}
        </Chip>
        <Chip selected={type === 'series'} onPress={() => setType('series')}>
          {t.series}
        </Chip>
      </View>
      {!debounced ? (
        <Empty
          icon={Search}
          title={t.searchHint}
          description="Search by title, genre, or a little inspiration."
        />
      ) : query.loading ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} retry={query.retry} />
      ) : (
        <>
          {!!query.data?.failures.length && (
            <View style={{ marginBottom: 20 }}>
              <Text style={{ color: colors.warning, fontSize: textSize(13) }}>
                {query.data.failures.join('\n')}
              </Text>
              <Button compact onPress={query.retry}>
                {t.retry}
              </Button>
            </View>
          )}
          {items.length ? (
            <>
              <Text style={[ui.muted, { marginBottom: 20 }]}>
                {items.length} titles found
              </Text>
              <MediaGrid items={items} availableWidth={contentWidth} />
            </>
          ) : (
            <Empty
              icon={Search}
              title="No titles found"
              description={
                'Try a different search or connect another provider.'
              }
            />
          )}
          {Object.keys(cursors).length > 0 && (
            <Button
              disabled={loadingMore}
              onPress={() => void loadMore()}
              style={{ marginTop: 25 }}
            >
              Load more
            </Button>
          )}
        </>
      )}
    </>
  );
}
export function CollectionScreen() {
  const app = useApp();
  const t = useT();
  const contentWidth = useContentWidth();
  const route = app.route;
  const [sort, setSort] = useState('featured');
  const [extra, setExtra] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const query = useAsync(
    JSON.stringify([route, sort, app.providerRevision]),
    async () => {
      if (route.name !== 'collection')
        throw new Error('Collection unavailable.');
      return app.runtime.call<Collection>(
        route.providerId,
        'getCollection',
        [route.id, { limit: 40, sort }],
        true,
      );
    },
  );
  useEffect(() => {
    setExtra([]);
    setCursor(query.data?.nextCursor);
  }, [query.data]);
  async function loadMore() {
    if (route.name !== 'collection' || !cursor) return;
    setBusy(true);
    try {
      const page = await app.runtime.call<Collection>(
        route.providerId,
        'getCollection',
        [route.id, { limit: 40, sort, cursor }],
      );
      setExtra((e) => [...e, ...page.items]);
      setCursor(page.nextCursor);
    } catch (error) {
      app.notify(String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title={route.name === 'collection' ? route.title : 'Collection'}
        eyebrow="CURATED FOR YOUR NEXT WATCH"
        description={query.data?.description}
        action={
          <Button icon={ChevronLeft} onPress={app.back}>
            {t.back}
          </Button>
        }
      />
      <ScrollView
        horizontal
        contentContainerStyle={{ gap: 10, marginBottom: 25 }}
      >
        {(
          query.data?.sorting ?? [
            { id: 'featured', label: 'Featured' },
            { id: 'title', label: 'Title' },
          ]
        ).map((option) => (
          <Chip
            key={option.id}
            selected={sort === option.id}
            onPress={() => setSort(option.id)}
          >
            {option.label}
          </Chip>
        ))}
      </ScrollView>
      {query.loading ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} retry={query.retry} />
      ) : (
        <MediaGrid
          availableWidth={contentWidth}
          items={[...(query.data?.items ?? []), ...extra].filter((i) =>
            visible(i, app.state.settings.showAdult),
          )}
        />
      )}
      {cursor && (
        <Button
          disabled={busy}
          onPress={() => void loadMore()}
          style={{ marginTop: 25 }}
        >
          Load more
        </Button>
      )}
    </>
  );
}
export function PersonScreen() {
  const app = useApp();
  const t = useT();
  const width = useContentWidth();
  const route = app.route;
  const query = useAsync(
    JSON.stringify([route, app.providerRevision]),
    async () => {
      if (route.name !== 'person') throw new Error('Person unavailable.');
      return app.runtime.call<{ person: Person; credits: MediaItem[] }>(
        route.providerId,
        'getPerson',
        [route.id],
        true,
      );
    },
  );
  return (
    <>
      <PageHeader
        title={
          query.data?.person.name ||
          (route.name === 'person' ? route.title : t.cast)
        }
        eyebrow="THE PEOPLE BEHIND THE STORIES"
        description={query.data?.person.biography}
        action={
          <Button icon={ChevronLeft} onPress={app.back}>
            {t.back}
          </Button>
        }
      />
      {query.loading ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} retry={query.retry} />
      ) : (
        <MediaGrid items={query.data?.credits ?? []} availableWidth={width} />
      )}
    </>
  );
}
const s = StyleSheet.create({
  connection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.surface,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dot: { height: 5, width: 5, borderRadius: 3, backgroundColor: colors.accent },
  connectionText: { color: colors.muted, fontSize: textSize(10) },
  hero: {
    borderRadius: 14,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#324039',
    justifyContent: 'center',
  },
  heroContent: { maxWidth: 590 },
  heroEyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
  },
  heroTitle: {
    fontSize: textSize(56),
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -2,
    marginBottom: 10,
  },
  heroMeta: { fontSize: textSize(11), color: '#bcc6ce', marginBottom: 14 },
  heroDescription: {
    color: '#a8b4c0',
    fontSize: textSize(13),
    lineHeight: textSize(22),
    maxWidth: 400,
  },
  heroPagination: {
    position: 'absolute',
    right: 25,
    bottom: 24,
    flexDirection: 'row',
    gap: 6,
  },
  pageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff60',
  },
  editorialLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    marginVertical: 31,
  },
  editorialText: {
    color: colors.subtle,
    fontSize: textSize(8),
    letterSpacing: 1.7,
  },
});
