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
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronRight,
  Download,
  Film,
  Play,
  UserRound,
} from 'lucide-react-native';
import {
  type MediaItem,
  type MediaSource,
  type Season,
} from '@cinefern/provider-sdk';
import { useApp } from '../app-context';
import {
  Button,
  Chip,
  Empty,
  Failure,
  Loading,
  MediaRow,
  SectionHeader,
  styles as ui,
} from '../ui/components';
import { colors, time, isTV, textSize } from '../ui/theme';
import { useT } from '../ui/i18n';
import { useAsync } from '../ui/use-async';
import { imageSource } from '../ui/artwork';

export function DetailScreen() {
  const app = useApp();
  const t = useT();
  const { width } = useWindowDimensions();
  const route = app.route;
  const initial = route.name === 'item' ? route.item : undefined;
  const [seasonId, setSeasonId] = useState('');
  const [downloading, setDownloading] = useState(false);
  const query = useAsync(
    JSON.stringify([
      'detail',
      initial?.providerId,
      initial?.id,
      app.providerRevision,
    ]),
    async () => {
      if (!initial) throw new Error('Media unavailable.');
      if (initial.providerId === 'direct')
        return {
          item: initial,
          seasons: [] as Season[],
          suggestions: [] as MediaItem[],
        };
      const item = await app.runtime.call<MediaItem>(
        initial.providerId,
        'getItem',
        [initial.id],
        true,
      );
      const provider = app.runtime.get(item.providerId).provider;
      void provider
        .onMediaOpened?.(item)
        .catch((error) => app.notify(String(error)));
      const results = await Promise.allSettled([
        item.type === 'series'
          ? app.runtime.call<Season[]>(
              item.providerId,
              'getSeasons',
              [item.id],
              true,
            )
          : Promise.resolve([] as Season[]),
        provider.getSuggestions
          ? app.runtime.call<MediaItem[]>(
              item.providerId,
              'getSuggestions',
              [item.id],
              true,
            )
          : Promise.resolve([] as MediaItem[]),
      ]);
      const seasons = results[0].status === 'fulfilled' ? results[0].value : [];
      const suggestions =
        results[1].status === 'fulfilled' ? results[1].value : [];
      return { item, seasons, suggestions };
    },
  );
  const item = query.data?.item ?? initial;
  useEffect(() => {
    setSeasonId(query.data?.seasons[0]?.id ?? '');
  }, [query.data]);
  const episodes = useAsync(
    JSON.stringify(['episodes', item?.id, seasonId, app.providerRevision]),
    async () => {
      if (!item || item.type !== 'series' || !seasonId) return [];
      return app.runtime.call<MediaItem[]>(
        item.providerId,
        'getEpisodes',
        [item.id, seasonId],
        true,
      );
    },
  );
  // Autoplay previews is opt-in and only runs once metadata has loaded.
  useEffect(() => {
    if (
      !query.data ||
      !app.state.settings.autoplayTrailers ||
      app.playback ||
      item?.type !== 'movie'
    )
      return;
    if (app.runtime.get(item.providerId).provider.getTrailer)
      void app.play(item, [item], true);
  }, [query.data]);
  async function download(target: MediaItem) {
    setDownloading(true);
    try {
      const sources = await app.runtime.call<MediaSource[]>(
        target.providerId,
        'getSources',
        [target.id, app.state.settings],
      );
      const source = sources.find(
        (s) => s.type === 'http' && s.downloadable && !s.live,
      );
      if (!source)
        throw new Error('This provider has no downloadable file source.');
      app.notify('Download started. Find it in Downloads.');
      void app.downloads
        .add(target, source)
        .catch((error) => app.notify(String(error)));
    } catch (error) {
      app.notify(String(error));
    } finally {
      setDownloading(false);
    }
  }
  if (query.loading) return <Loading />;
  if (query.error) return <Failure error={query.error} retry={query.retry} />;
  if (!item) return null;
  const isSeries = item.type === 'series';
  const saved = app.library.isSaved(item);
  const provider =
    item.providerId === 'direct' ? undefined : app.runtime.get(item.providerId);
  const playTarget = isSeries ? episodes.data?.[0] : item;
  return (
    <>
      <View style={{ marginBottom: 20 }}>
        <Button
          icon={ArrowLeft}
          variant="ghost"
          compact
          onPress={app.back}
          style={{ alignSelf: 'flex-start' }}
        >
          {t.back}
        </Button>
      </View>
      <View style={[s.hero, { minHeight: width < 820 ? 390 : 400 }]}>
        {(item.backdrop || item.poster) && (
          <Image
            source={imageSource(item.backdrop || item.poster)}
            style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
            resizeMode="cover"
          />
        )}
        <LinearGradient
          colors={['#0c1015f5', '#0c1015a0', '#0c101540']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['#0c101500', '#0c1015f8']}
          style={StyleSheet.absoluteFill}
        />
        <View style={[s.heroContent, { padding: width < 820 ? 22 : 32 }]}>
          <Text style={ui.eyebrow}>
            {provider?.manifest.name.toUpperCase() ?? 'DIRECT STREAM'} /{' '}
            {item.type.toUpperCase()}
          </Text>
          <Text style={[s.title, width < 820 && { fontSize: textSize(36) }]}>
            {item.title}
          </Text>
          <Text style={s.meta}>
            {[
              item.year,
              item.genres?.join(' · '),
              item.duration && Math.round(item.duration / 60) + ' min',
            ]
              .filter(Boolean)
              .join('   /   ')}
          </Text>
          <Text style={s.overview}>{item.overview}</Text>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 10,
              marginTop: 23,
            }}
          >
            <Button
              variant="primary"
              icon={Play}
              disabled={!playTarget || app.playingLoading}
              onPress={() =>
                playTarget &&
                void app.play(playTarget, isSeries ? episodes.data : [item])
              }
            >
              {t.play}
            </Button>
            <Button
              icon={saved ? Check : Bookmark}
              onPress={() => app.toggleSave(item)}
            >
              {saved ? t.saved : t.save}
            </Button>
            {provider?.provider.getTrailer && !isSeries && (
              <Button
                icon={Film}
                onPress={() => void app.play(item, [item], true)}
              >
                {t.trailer}
              </Button>
            )}
            {!isSeries && provider?.provider.getSources && (
              <Button
                icon={Download}
                disabled={downloading}
                label="Download media"
                onPress={() => void download(item)}
              />
            )}
          </View>
        </View>
      </View>
      {isSeries && (
        <View style={{ marginTop: 32, gap: 20, marginBottom: 35 }}>
          <SectionHeader title={t.episodes} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10 }}
          >
            {query.data?.seasons.map((season) => (
              <Chip
                key={season.id}
                selected={seasonId === season.id}
                onPress={() => setSeasonId(season.id)}
              >
                {t.season} {season.number} · {season.title}
              </Chip>
            ))}
          </ScrollView>
          {episodes.loading ? (
            <Loading />
          ) : episodes.error ? (
            <Failure error={episodes.error} retry={episodes.retry} />
          ) : !episodes.data?.length ? (
            <Empty
              title="No episodes yet"
              description="This season has no episodes available."
            />
          ) : (
            episodes.data.map((episode, i) => (
              <View key={episode.id} style={s.episode}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={'Play ' + episode.title}
                  style={{
                    flexDirection: 'row',
                    flex: 1,
                    alignItems: 'center',
                    gap: 17,
                  }}
                  onPress={() => void app.play(episode, episodes.data)}
                >
                  <Text style={s.episodeNumber}>
                    {String(i + 1).padStart(2, '0')}
                  </Text>
                  {width > 530 && (
                    <Image
                      source={imageSource(episode.poster)}
                      style={s.episodeImage}
                    />
                  )}
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={s.episodeTitle}>{episode.title}</Text>
                    <Text numberOfLines={2} style={s.episodeDescription}>
                      {episode.overview}
                    </Text>
                    {episode.duration && (
                      <Text style={ui.muted}>{time(episode.duration)}</Text>
                    )}
                  </View>
                  <Play size={18} color={colors.accent} />
                </Pressable>
                <Button
                  icon={Download}
                  compact
                  variant="ghost"
                  label={'Download ' + episode.title}
                  onPress={() => void download(episode)}
                />
              </View>
            ))
          )}
        </View>
      )}
      {!!item.info && (
        <View style={s.info}>
          {Object.entries(item.info).map(([label, value]) => (
            <View key={label} style={{ gap: 8, minWidth: 150, maxWidth: 300 }}>
              <Text style={s.infoLabel}>{label.toUpperCase()}</Text>
              <Text style={s.infoValue}>{value}</Text>
            </View>
          ))}
        </View>
      )}
      {!!item.cast?.length && (
        <View style={{ gap: 18, marginTop: 26, marginBottom: 32 }}>
          <SectionHeader title={t.cast} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 12 }}
          >
            {item.cast.map((person) => (
              <Pressable
                accessibilityRole="button"
                key={person.id}
                style={s.person}
                onPress={() =>
                  provider?.provider.getPerson
                    ? app.navigate({
                        name: 'person',
                        providerId: person.providerId,
                        id: person.id,
                        title: person.name,
                      })
                    : app.notify(
                        person.name + (person.role ? ' · ' + person.role : ''),
                      )
                }
              >
                <View style={s.personIcon}>
                  {person.image ? (
                    <Image
                      source={{ uri: person.image }}
                      style={StyleSheet.absoluteFill}
                    />
                  ) : (
                    <UserRound size={23} color={colors.subtle} />
                  )}
                </View>
                <View style={{ gap: 5 }}>
                  <Text style={s.personName}>{person.name}</Text>
                  <Text style={ui.muted}>{person.role}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
      <MediaRow
        title={t.recommendations}
        items={(query.data?.suggestions ?? []).filter(
          (i) => app.state.settings.showAdult || !i.adult,
        )}
      />
    </>
  );
}
const s = StyleSheet.create({
  hero: {
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: colors.surface,
    justifyContent: 'flex-end',
  },
  heroContent: { maxWidth: 670, gap: 15 },
  title: {
    color: colors.text,
    fontSize: textSize(48),
    fontWeight: '600',
    letterSpacing: -1.5,
  },
  meta: { color: '#bac5d0', fontSize: textSize(12) },
  overview: {
    color: '#acb8c4',
    lineHeight: textSize(24),
    fontSize: textSize(14),
    maxWidth: 570,
  },
  episode: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    padding: 18,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  episodeNumber: {
    color: colors.subtle,
    fontSize: textSize(17),
    fontWeight: '600',
  },
  episodeImage: { width: 135, height: 78, borderRadius: 6 },
  episodeTitle: {
    fontSize: textSize(14),
    fontWeight: '600',
    color: colors.text,
  },
  episodeDescription: {
    fontSize: textSize(12),
    color: colors.muted,
    lineHeight: textSize(18),
  },
  info: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 28,
    paddingVertical: 25,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    color: colors.subtle,
    fontSize: textSize(9),
    letterSpacing: 1.7,
  },
  infoValue: {
    color: colors.muted,
    fontSize: textSize(12),
    lineHeight: textSize(19),
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 9,
    padding: 15,
    backgroundColor: colors.surface,
    minWidth: 220,
  },
  personIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personName: { color: colors.text, fontSize: textSize(13), fontWeight: '500' },
});
