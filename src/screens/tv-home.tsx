import React, { useEffect, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TVFocusGuideView,
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
  Info,
  Play,
} from 'lucide-react-native';
import {
  mediaKey,
  type HomeFeed,
  type MediaItem,
} from '@cinefern/provider-sdk';
import { useApp } from '../app-context';
import { continueWatching } from '../core/library';
import {
  Button,
  Chip,
  Empty,
  Failure,
  Loading,
  MediaRow,
} from '../ui/components';
import { imageSource } from '../ui/artwork';
import { useT } from '../ui/i18n';
import { useAsync } from '../ui/use-async';
import { colors } from '../ui/theme';

export function TVHomeScreen() {
  const app = useApp();
  const t = useT();
  const { height } = useWindowDimensions();
  const route =
    app.route.name === 'home' ? app.route : { name: 'home' as const };
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const records = app.runtime
    .all()
    .filter(
      (record) =>
        record.manifest.capabilities.includes('browse') &&
        (!route.providerId || record.manifest.id === route.providerId) &&
        (app.state.settings.showAdult || !record.manifest.adult),
    );
  const query = useAsync(
    JSON.stringify([
      'tv-home',
      app.providerRevision,
      route.providerId,
      app.state.settings.showAdult,
    ]),
    async () => {
      const results = await Promise.allSettled(
        records.map((record) =>
          app.runtime.call<HomeFeed>(record.manifest.id, 'getHome', [], true),
        ),
      );
      const feeds: HomeFeed[] = [];
      const failures: string[] = [];
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') feeds.push(result.value);
        else
          failures.push(
            records[i]!.manifest.name + ': ' + String(result.reason),
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
  useEffect(() => setFeaturedIndex(0), [route.providerId, route.filter]);
  const visible = (item: MediaItem) =>
    (app.state.settings.showAdult || !item.adult) &&
    (!route.filter || route.filter === item.type);
  const featured = query.data?.featured.filter(visible) ?? [];
  const hero = featured[featuredIndex % Math.max(1, featured.length)];
  const continuing = continueWatching(app.state.history).filter(
    (entry) =>
      visible(entry.item) &&
      (!route.providerId || route.providerId === entry.item.providerId),
  );
  const collections =
    query.data?.collections
      .map((collection) => ({
        ...collection,
        items: collection.items.filter(visible),
      }))
      .filter((collection) => collection.items.length) ?? [];
  if (query.loading)
    return (
      <View style={s.placeholder}>
        <Text style={s.pageTitle}>{t.discover}</Text>
        <Loading />
      </View>
    );
  return (
    <>
      {hero ? (
        <View
          style={[
            s.hero,
            { height: Math.max(440, Math.min(640, height * 0.56)) },
          ]}
        >
          <Image
            source={imageSource(hero.backdrop || hero.poster)}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['#080809f5', '#08080985', '#08080905']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['#08080900', '#08080930', '#080809']}
            locations={[0, 0.55, 1]}
            style={StyleSheet.absoluteFill}
          />
          <Text style={s.homeTitle}>
            {route.filter === 'movie'
              ? t.movies
              : route.filter === 'series'
                ? t.series
                : t.discover}
          </Text>
          <View style={s.heroInfo}>
            <Text style={s.eyebrow}>
              {
                app.manifests.find(
                  (manifest) => manifest.id === hero.providerId,
                )?.name
              }
            </Text>
            <Text numberOfLines={2} style={s.heroTitle}>
              {hero.title}
            </Text>
            <Text style={s.metadata}>
              {[
                hero.year,
                hero.genres?.slice(0, 2).join(' · '),
                hero.duration ? Math.round(hero.duration / 60) + ' min' : '',
              ]
                .filter(Boolean)
                .join('    ')}
            </Text>
            <Text numberOfLines={2} style={s.overview}>
              {hero.overview}
            </Text>
            <TVFocusGuideView autoFocus style={s.actions}>
              <Button
                variant="primary"
                icon={Play}
                disabled={app.playingLoading}
                onPress={() =>
                  hero.type === 'series'
                    ? app.navigate({ name: 'item', item: hero })
                    : void app.play(hero)
                }
              >
                {hero.type === 'series' ? t.details : t.play}
              </Button>
              <Button
                icon={Info}
                onPress={() => app.navigate({ name: 'item', item: hero })}
              >
                {t.details}
              </Button>
              <Button
                icon={app.library.isSaved(hero) ? Check : Bookmark}
                label={app.library.isSaved(hero) ? t.saved : t.save}
                onPress={() => app.toggleSave(hero)}
              />
            </TVFocusGuideView>
          </View>
          {featured.length > 1 && (
            <TVFocusGuideView autoFocus style={s.pagination}>
              <Button
                compact
                icon={ChevronLeft}
                label="Previous featured title"
                onPress={() =>
                  setFeaturedIndex(
                    (i) => (i + featured.length - 1) % featured.length,
                  )
                }
              />
              <Text style={s.pageNumber}>
                {(featuredIndex % featured.length) + 1} / {featured.length}
              </Text>
              <Button
                compact
                icon={ChevronRight}
                label="Next featured title"
                onPress={() =>
                  setFeaturedIndex((i) => (i + 1) % featured.length)
                }
              />
            </TVFocusGuideView>
          )}
        </View>
      ) : (
        <View style={s.placeholder}>
          <Text style={s.pageTitle}>{t.discover}</Text>
          {query.loading && <Loading />}
        </View>
      )}
      <View style={s.shelves}>
        <TVFocusGuideView autoFocus>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.filters}
          >
            <Chip
              selected={!route.filter}
              onPress={() =>
                app.navigate({ name: 'home', providerId: route.providerId })
              }
            >
              {t.forYou}
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
              <Chip
                onPress={() =>
                  app.navigate({ name: 'home', filter: route.filter })
                }
              >
                {t.allProviders}
              </Chip>
            )}
          </ScrollView>
        </TVFocusGuideView>
        {query.error && <Failure error={query.error} retry={query.retry} />}
        {continuing.length > 0 && (
          <MediaRow
            title={t.continue}
            landscape
            items={continuing.map((entry) => entry.item)}
            progress={(item) => {
              const entry = continuing.find(
                (entry) => mediaKey(entry.item) === mediaKey(item),
              );
              return entry && entry.duration > 0
                ? entry.position / entry.duration
                : undefined;
            }}
          />
        )}
        {collections.map((collection) => (
          <MediaRow
            key={collection.providerId + ':' + collection.id}
            title={collection.title}
            landscape
            items={collection.items}
            action={
              <Button
                compact
                variant="ghost"
                icon={ArrowRight}
                label={collection.title + ': ' + t.details}
                onPress={() =>
                  app.navigate({
                    name: 'collection',
                    id: collection.id,
                    providerId: collection.providerId,
                    title: collection.title,
                  })
                }
              />
            }
          />
        ))}
        {!query.loading && !query.error && !hero && !collections.length && (
          <Empty
            title={t.libraryTitle}
            description="Connect a media provider to see your movies and shows here."
            action={
              <Button onPress={() => app.navigate({ name: 'providers' })}>
                {t.providers}
              </Button>
            }
          />
        )}
        {!!query.data?.failures.length && (
          <Failure error={query.data.failures.join('\n')} retry={query.retry} />
        )}
      </View>
    </>
  );
}
const s = StyleSheet.create({
  hero: {
    paddingLeft: 184,
    paddingRight: 60,
    justifyContent: 'flex-end',
    paddingBottom: 65,
  },
  homeTitle: {
    position: 'absolute',
    top: 55,
    left: 184,
    color: '#fff',
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  heroInfo: { width: '65%', maxWidth: 880, gap: 14 },
  eyebrow: { fontSize: 19, fontWeight: '600', color: '#d5d5da' },
  heroTitle: {
    fontSize: 66,
    lineHeight: 72,
    letterSpacing: -2,
    fontWeight: '800',
    color: '#fff',
  },
  metadata: { color: '#dddde2', fontSize: 22, fontWeight: '500' },
  overview: { color: '#dddde2', fontSize: 23, lineHeight: 33, maxWidth: 790 },
  actions: { flexDirection: 'row', gap: 18, marginTop: 16 },
  pagination: {
    position: 'absolute',
    bottom: 75,
    right: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  pageNumber: { color: '#b8b8be', fontSize: 19, fontVariant: ['tabular-nums'] },
  shelves: { paddingLeft: 184, paddingRight: 52 },
  filters: {
    gap: 16,
    paddingVertical: 14,
    paddingHorizontal: 6,
    marginBottom: 20,
  },
  placeholder: {
    paddingLeft: 184,
    paddingRight: 52,
    paddingTop: 55,
    minHeight: 220,
  },
  pageTitle: { color: colors.text, fontSize: 44, fontWeight: '700' },
});
