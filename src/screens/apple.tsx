import {
  Host,
  Picker,
  Text as SwiftText,
  Button as SwiftButton,
  Section,
} from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { AppleForm } from '../ui/apple-controls';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { SFSymbol } from 'sf-symbols-typescript';
import { Bookmark, Check, Info, ChevronRight, Play } from 'lucide-react-native';
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
      (entry.item.providerId === 'direct' ||
        app.library.isProviderEnabled(entry.item.providerId)) &&
      visible(entry.item) &&
      (!route.providerId || entry.item.providerId === route.providerId),
  );
  return (
    <>
      <Host
        matchContents={{ vertical: true }}
        colorScheme="dark"
        style={{ marginBottom: 20 }}
      >
        <Picker
          selection={route.filter ?? 'all'}
          onSelectionChange={(filter: string) => {
            setFeaturedIndex(0);
            app.navigate({
              name: 'home',
              providerId: route.providerId,
              filter:
                filter === 'all' ? undefined : (filter as 'movie' | 'series'),
            });
          }}
          modifiers={[pickerStyle('segmented')]}
        >
          <SwiftText modifiers={[tag('all')]}>{t.forYou}</SwiftText>
          <SwiftText modifiers={[tag('movie')]}>{t.movies}</SwiftText>
          <SwiftText modifiers={[tag('series')]}>{t.series}</SwiftText>
        </Picker>
      </Host>
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
                { minHeight: Math.min(420, Math.max(330, width * 0.85)) },
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
                  <Button
                    variant="primary"
                    icon={Play}
                    label={t.play + ' ' + hero.title}
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
                    label={app.library.isSaved(hero) ? t.saved : t.save}
                    onPress={() => app.toggleSave(hero)}
                  />
                  <Button
                    icon={Info}
                    label={t.details}
                    onPress={() => app.navigate({ name: 'item', item: hero })}
                  />
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
              title={records.length ? t.noResults : t.welcomeProviders}
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
    symbol: SFSymbol;
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
    <AppleForm>
      <Section>
        {rows.map((row) => (
          <SwiftButton
            key={row.label}
            label={row.label + (row.count ? ` (${row.count})` : '')}
            systemImage={row.symbol}
            onPress={() => app.navigate(row.route)}
          />
        ))}
      </Section>
      {!!continuing.length && (
        <Section title={t.continue}>
          {continuing.map((entry) => (
            <SwiftButton
              key={mediaKey(entry.item)}
              label={entry.item.title}
              systemImage="play.circle"
              onPress={() => void app.play(entry.item)}
            />
          ))}
        </Section>
      )}
      {!!saved.length && (
        <Section title={t.watchlist}>
          {saved.map((entry) => (
            <SwiftButton
              key={mediaKey(entry.item)}
              label={entry.item.title}
              systemImage="film"
              onPress={() => app.navigate({ name: 'item', item: entry.item })}
            />
          ))}
        </Section>
      )}
      {!saved.length && !continuing.length && (
        <Section
          footer={
            <SwiftText>
              Your saved titles, downloads, and playback history appear here.
            </SwiftText>
          }
        >
          <SwiftButton
            label={t.discover}
            systemImage="play.rectangle"
            onPress={() => app.navigate({ name: 'home' })}
          />
        </Section>
      )}
    </AppleForm>
  );
}

const s = StyleSheet.create({
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
  dots: { flexDirection: 'row', justifyContent: 'center', marginBottom: 16 },
  dotTarget: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#48484a' },
  error: { color: colors.warning, fontSize: 15, marginBottom: 20 },
});
