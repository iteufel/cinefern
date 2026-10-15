import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Bookmark, ChevronRight, Play } from 'lucide-react-native';
import {
  mediaKey,
  type HomeFeed,
  type MediaItem,
} from '@cinefern/provider-sdk';
import { useApp, type Route } from '../app-context';
import { continueWatching } from '../core/library';
import { Button, Empty, Failure, Loading, MediaRow } from '../ui/components';
import { imageSource } from '../ui/artwork';
import { colors } from '../ui/theme';
import { useT } from '../ui/i18n';
import { useAsync } from '../ui/use-async';
import { useContentWidth } from '../ui/shell';

export function IOSHomeScreen() {
  const app = useApp();
  const t = useT();
  const width = useContentWidth();
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
    JSON.stringify([
      'apple-home',
      route.providerId,
      app.providerRevision,
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
  const visible = (item: MediaItem) =>
    (app.state.settings.showAdult || !item.adult) &&
    (!route.filter || item.type === route.filter);
  const featured = query.data?.featured.filter(visible) ?? [];
  const index = featuredIndex % Math.max(1, featured.length);
  const firstDot = Math.max(0, Math.min(index - 2, featured.length - 5));
  const hero = featured[index];
  const collections =
    query.data?.collections
      .map((collection) => ({
        ...collection,
        items: collection.items.filter(visible),
      }))
      .filter((collection) => collection.items.length) ?? [];
  const continuing = continueWatching(app.state.history).filter(
    (entry) =>
      visible(entry.item) &&
      (!route.providerId || entry.item.providerId === route.providerId),
  );
  return (
    <>
      <View accessibilityRole="tablist" style={s.segmented}>
        {(
          [
            [undefined, t.forYou],
            ['movie', t.movies],
            ['series', t.series],
          ] as const
        ).map(([filter, label]) => (
          <Pressable
            key={label}
            accessibilityRole="tab"
            accessibilityState={{ selected: route.filter === filter }}
            onPress={() => {
              setFeaturedIndex(0);
              app.navigate({
                name: 'home',
                providerId: route.providerId,
                filter,
              });
            }}
            style={[s.segment, route.filter === filter && s.selectedSegment]}
          >
            <Text
              style={[
                s.segmentLabel,
                route.filter === filter && { color: '#ffffff' },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      {route.providerId && (
        <Button variant="ghost" onPress={() => app.navigate({ name: 'home' })}>
          {t.allProviders}
        </Button>
      )}
      {query.loading ? (
        <Loading />
      ) : query.error ? (
        <Failure error={query.error} retry={query.retry} />
      ) : (
        <>
          {hero && (
            <View
              style={[
                s.hero,
                { minHeight: Math.min(460, Math.max(380, width * 0.85)) },
              ]}
            >
              <Image
                source={imageSource(hero.backdrop || hero.poster)}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
              <LinearGradient
                colors={['#00000000', '#00000030', '#000000eb']}
                locations={[0, 0.3, 1]}
                style={StyleSheet.absoluteFill}
              />
              <View style={s.heroContent}>
                <Text style={s.featured}>{t.featured}</Text>
                <Text style={s.heroTitle} accessibilityRole="header">
                  {hero.title}
                </Text>
                <Text style={s.heroMeta}>
                  {[
                    hero.year,
                    hero.genres?.[0],
                    hero.duration && Math.round(hero.duration / 60) + ' min',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                <View style={s.heroActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t.play + ' ' + hero.title}
                    accessibilityState={{ disabled: app.playingLoading }}
                    disabled={app.playingLoading}
                    onPress={() =>
                      hero.type === 'series'
                        ? app.navigate({ name: 'item', item: hero })
                        : void app.play(hero)
                    }
                    style={({ pressed }) => [
                      s.play,
                      (pressed || app.playingLoading) && { opacity: 0.6 },
                    ]}
                  >
                    <SymbolView
                      name="play.fill"
                      size={16}
                      tintColor="#000000"
                    />
                    <Text style={s.playText}>{t.play}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      app.library.isSaved(hero) ? t.saved : t.save
                    }
                    accessibilityState={{ selected: app.library.isSaved(hero) }}
                    onPress={() => app.toggleSave(hero)}
                    style={({ pressed }) => [
                      s.save,
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <SymbolView
                      name={app.library.isSaved(hero) ? 'checkmark' : 'plus'}
                      size={21}
                      tintColor="#ffffff"
                    />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t.details}
                    onPress={() => app.navigate({ name: 'item', item: hero })}
                    style={s.save}
                  >
                    <SymbolView name="info" size={21} tintColor="#ffffff" />
                  </Pressable>
                </View>
              </View>
            </View>
          )}
          {featured.length > 1 && (
            <View style={s.dots}>
              {featured.slice(firstDot, firstDot + 5).map((item, offset) => (
                <Pressable
                  key={mediaKey(item)}
                  accessibilityRole="button"
                  accessibilityLabel={t.featured + ': ' + item.title}
                  accessibilityState={{ selected: index === firstDot + offset }}
                  onPress={() => setFeaturedIndex(firstDot + offset)}
                  style={s.dotTarget}
                >
                  <View
                    style={[
                      s.dot,
                      index === firstDot + offset && {
                        backgroundColor: colors.text,
                      },
                    ]}
                  />
                </Pressable>
              ))}
            </View>
          )}
          <MediaRow
            title={t.continue}
            items={continuing.map((entry) => entry.item)}
            landscape
            progress={(item) => {
              const entry = app.library.progress(item);
              return entry && entry.position / entry.duration;
            }}
          />
          {!!query.data?.failures.length && (
            <Text style={s.error}>{query.data.failures.join('\n')}</Text>
          )}
          {collections.map((collection) => (
            <MediaRow
              key={collection.providerId + ':' + collection.id}
              title={collection.title}
              items={collection.items}
              action={
                app.runtime
                  .get(collection.providerId)
                  .manifest.capabilities.includes('collections') ? (
                  <Button
                    icon={ChevronRight}
                    label={t.seeAll + ': ' + collection.title}
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
                  />
                ) : undefined
              }
            />
          ))}
          {!hero && !collections.length && (
            <Empty
              title={t.noResults}
              description={t.welcomeProvidersDescription}
              action={
                <Button onPress={() => app.navigate({ name: 'providers' })}>
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

export function IOSLibraryScreen() {
  const app = useApp();
  const t = useT();
  const rows: {
    route: Route;
    label: string;
    symbol: SymbolViewProps['name'];
    count: number;
  }[] = [
    {
      route: { name: 'watchlist' },
      label: t.watchlist,
      symbol: 'bookmark',
      count: app.state.watchlist.length,
    },
    {
      route: { name: 'downloads' },
      label: t.downloads,
      symbol: 'arrow.down.circle',
      count: app.state.downloads.length,
    },
    {
      route: { name: 'history' },
      label: t.history,
      symbol: 'clock',
      count: app.state.history.length,
    },
  ];
  const visible = (item: MediaItem) =>
    app.state.settings.showAdult || !item.adult;
  const continuing = continueWatching(app.state.history).filter((entry) =>
    visible(entry.item),
  );
  const saved = app.state.watchlist
    .filter((entry) => visible(entry.item))
    .slice(0, 12);
  return (
    <>
      <View style={s.libraryGroup}>
        {rows.map((row, index) => (
          <Pressable
            key={row.label}
            accessibilityRole="button"
            accessibilityLabel={row.label + ', ' + row.count}
            onPress={() => app.navigate(row.route)}
            style={({ pressed }) => [
              s.libraryRow,
              pressed && { backgroundColor: colors.raised },
            ]}
          >
            <SymbolView
              name={row.symbol}
              size={23}
              tintColor={colors.accent}
              style={{ width: 28 }}
            />
            <View
              style={[
                s.libraryRowContent,
                index < rows.length - 1 && s.separator,
              ]}
            >
              <Text style={s.libraryLabel}>{row.label}</Text>
              <Text style={s.count}>{row.count}</Text>
              <SymbolView
                name="chevron.right"
                size={13}
                weight="semibold"
                tintColor={colors.subtle}
              />
            </View>
          </Pressable>
        ))}
      </View>
      <MediaRow
        title={t.continue}
        items={continuing.map((entry) => entry.item)}
        landscape
        progress={(item) => {
          const entry = app.library.progress(item);
          return entry && entry.position / entry.duration;
        }}
      />
      <MediaRow
        title={t.watchlist}
        items={saved.map((entry) => entry.item)}
        action={
          <Button
            compact
            variant="ghost"
            icon={ChevronRight}
            label={t.watchlist}
            onPress={() => app.navigate({ name: 'watchlist' })}
          />
        }
      />
      {!saved.length && !continuing.length && (
        <Empty
          icon={Bookmark}
          title={t.noResults}
          description={t.welcomeOfflineDescription}
          action={
            <Button
              icon={Play}
              variant="primary"
              onPress={() => app.navigate({ name: 'home' })}
            >
              {t.discover}
            </Button>
          }
        />
      )}
    </>
  );
}

const s = StyleSheet.create({
  segmented: {
    flexDirection: 'row',
    padding: 3,
    backgroundColor: colors.surface,
    borderRadius: 11,
    marginBottom: 24,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    borderRadius: 8,
  },
  selectedSegment: { backgroundColor: '#636366' },
  segmentLabel: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  hero: {
    borderRadius: 18,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: colors.surface,
    marginBottom: 12,
  },
  heroContent: { padding: 22, paddingTop: 80 },
  featured: {
    color: '#ffffffcc',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  heroMeta: { color: '#ffffffcc', fontSize: 15, marginTop: 8 },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 24,
  },
  play: {
    minHeight: 48,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  playText: { color: '#000000', fontSize: 17, fontWeight: '600' },
  save: {
    width: 48,
    height: 48,
    backgroundColor: '#ffffff29',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: { flexDirection: 'row', justifyContent: 'center', marginBottom: 16 },
  dotTarget: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#48484a' },
  error: { color: colors.warning, fontSize: 15, marginBottom: 20 },
  libraryGroup: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    marginBottom: 32,
  },
  libraryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    gap: 14,
  },
  libraryRowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    paddingVertical: 14,
    paddingRight: 16,
    gap: 12,
  },
  separator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  libraryLabel: { flex: 1, color: colors.text, fontSize: 17 },
  count: { color: colors.muted, fontSize: 17, fontVariant: ['tabular-nums'] },
});
