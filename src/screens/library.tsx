import { Pressable } from '../ui/focus';
import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Bell,
  BellOff,
  Bookmark,
  Check,
  Download,
  History,
  Play,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react-native';
import { mediaKey, type MediaItem } from '@cinefern/provider-sdk';
import { useApp } from '../app-context';
import {
  Button,
  Card,
  Chip,
  Empty,
  MediaGrid,
  PageHeader,
  styles as ui,
} from '../ui/components';
import { useContentWidth } from '../ui/shell';
import { colors, bytes, time, isTV, textSize } from '../ui/theme';
import { useT } from '../ui/i18n';
import { ConfirmDialog } from '../ui/dialog';
import { imageSource } from '../ui/artwork';

export function WatchlistScreen() {
  const app = useApp();
  const t = useT();
  const width = useContentWidth();
  const [provider, setProvider] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState('added');
  const [checking, setChecking] = useState(false);
  const items = app.state.watchlist
    .filter(
      (e) =>
        (!provider || e.item.providerId === provider) &&
        (!type || e.item.type === type) &&
        (app.state.settings.showAdult || !e.item.adult),
    )
    .sort((a, b) =>
      sort === 'title'
        ? a.item.title.localeCompare(b.item.title)
        : b.addedAt - a.addedAt,
    );
  const providers = app.manifests.filter((m) =>
    app.state.watchlist.some((e) => e.item.providerId === m.id),
  );
  async function check() {
    setChecking(true);
    try {
      await app.checkUpdates();
    } catch (error) {
      app.notify(String(error));
    } finally {
      setChecking(false);
    }
  }
  async function sync() {
    const external = app.runtime.all().filter((r) => r.provider.getWatchlist);
    if (!external.length) {
      app.notify('Connect a provider with watchlist sync support.');
      return;
    }
    const results = await Promise.allSettled(
      external.map(async (record) => {
        const items = await app.runtime.call<MediaItem[]>(
          record.manifest.id,
          'getWatchlist',
        );
        for (const item of items)
          if (!app.library.isSaved(item)) app.library.toggleWatchlist(item);
      }),
    );
    app.notify(
      results.some((r) => r.status === 'rejected')
        ? 'Some providers could not sync.'
        : 'Provider watchlists imported',
    );
  }
  const columns = Math.max(2, Math.floor(width / 200));
  const cardWidth = (width - (columns - 1) * 18) / columns;
  return (
    <>
      <PageHeader
        title={t.watchlist}
        eyebrow="SAVE IT FOR A GOOD NIGHT"
        description={
          app.state.watchlist.length + ' stories, ready when you are.'
        }
        action={
          <Button
            icon={RefreshCw}
            disabled={checking}
            onPress={() => void check()}
          >
            Check for episodes
          </Button>
        }
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 9, marginBottom: 14 }}
      >
        <Chip selected={!provider} onPress={() => setProvider('')}>
          {t.allProviders}
        </Chip>
        {providers.map((m) => (
          <Chip
            key={m.id}
            selected={provider === m.id}
            onPress={() => setProvider(m.id)}
          >
            {m.name}
          </Chip>
        ))}
      </ScrollView>
      <View
        style={{
          flexDirection: 'row',
          gap: 9,
          flexWrap: 'wrap',
          marginBottom: 27,
        }}
      >
        <Chip selected={!type} onPress={() => setType('')}>
          All titles
        </Chip>
        <Chip selected={type === 'movie'} onPress={() => setType('movie')}>
          {t.movies}
        </Chip>
        <Chip selected={type === 'series'} onPress={() => setType('series')}>
          {t.series}
        </Chip>
        <Chip
          onPress={() => setSort((s) => (s === 'added' ? 'title' : 'added'))}
        >
          Sort: {sort === 'added' ? 'Recently added' : 'Title'}
        </Chip>
        {app.runtime.all().some((r) => r.provider.getWatchlist) && (
          <Button compact variant="ghost" onPress={() => void sync()}>
            Import provider watchlists
          </Button>
        )}
      </View>
      {items.length ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 18,
            rowGap: 28,
          }}
        >
          {items.map((entry) => (
            <View
              key={mediaKey(entry.item)}
              style={{ width: cardWidth, gap: 9 }}
            >
              <Card item={entry.item} width={cardWidth} />
              {entry.item.type === 'series' && (
                <Button
                  compact
                  variant="ghost"
                  icon={entry.notify ? Bell : BellOff}
                  onPress={() =>
                    void app
                      .toggleNotify(entry.item)
                      .catch((error) => app.notify(String(error)))
                  }
                >
                  {entry.notify
                    ? 'Episode alerts on'
                    : 'Notify of new episodes'}
                </Button>
              )}
              {!!entry.newEpisodes.length && (
                <Pressable
                  onPress={() => {
                    app.navigate({ name: 'item', item: entry.item });
                    app.library.updateWatchlist(entry.item, {
                      newEpisodes: [],
                    });
                  }}
                >
                  <Text
                    style={{ color: colors.accent, fontSize: textSize(12) }}
                  >
                    {entry.newEpisodes.length} new episodes
                  </Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ) : (
        <Empty
          icon={Bookmark}
          title="A good story is worth saving"
          description="Tap the bookmark on a movie or series. Your next movie night will be waiting here."
          action={
            <Button
              onPress={() => app.navigate({ name: 'home' })}
              variant="primary"
            >
              {t.discover}
            </Button>
          }
        />
      )}
    </>
  );
}
export function DownloadsScreen() {
  const app = useApp();
  const t = useT();
  const [remove, setRemove] = useState<string | null>(null);
  return (
    <>
      <PageHeader
        title={t.downloads}
        eyebrow="TAKE YOUR STORIES WITH YOU"
        description={
          isTV
            ? 'Cache a video file for offline playback. Apple TV may clear cached files when it needs storage; you can download them again.'
            : 'Download a file source from a movie or episode to watch it offline.'
        }
      />
      {!app.state.downloads.length ? (
        <Empty
          icon={Download}
          title="A little cinema, wherever you go"
          description="Your downloaded movies and episodes will appear here. Open a title and tap Download."
          action={
            <Button onPress={() => app.navigate({ name: 'home' })}>
              {t.discover}
            </Button>
          }
        />
      ) : (
        <View style={{ gap: 14 }}>
          {app.state.downloads.map((entry) => (
            <View style={s.download} key={entry.id}>
              <View style={s.thumbnail}>
                {entry.item.poster && (
                  <Image
                    source={imageSource(entry.item.poster)}
                    style={[
                      StyleSheet.absoluteFill,
                      { width: '100%', height: '100%' },
                    ]}
                  />
                )}
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={s.title}>{entry.item.title}</Text>
                <Text
                  style={[
                    ui.muted,
                    entry.status === 'failed' && { color: colors.warning },
                  ]}
                >
                  {entry.status === 'complete'
                    ? 'Ready to watch offline'
                    : entry.status === 'downloading'
                      ? bytes(entry.bytes) +
                        (entry.totalBytes
                          ? ' / ' + bytes(entry.totalBytes)
                          : '')
                      : (entry.error ?? entry.status)}
                </Text>
                <View style={s.progress}>
                  <View
                    style={{
                      height: 3,
                      width: `${Math.min(100, entry.progress * 100)}%`,
                      backgroundColor: colors.accent,
                    }}
                  />
                </View>
              </View>
              <View style={{ gap: 5 }}>
                {entry.status === 'complete' ? (
                  <Button
                    icon={Play}
                    compact
                    variant="primary"
                    label={'Play ' + entry.item.title}
                    onPress={() => void app.play(entry.item)}
                  />
                ) : entry.status === 'downloading' ? (
                  <Button
                    icon={X}
                    compact
                    label="Cancel download"
                    onPress={() => app.downloads.cancel(entry.id)}
                  />
                ) : (
                  <Button
                    icon={RefreshCw}
                    compact
                    label="Retry download"
                    onPress={() => void app.downloads.retry(entry.id)}
                  />
                )}
                <Button
                  icon={Trash2}
                  variant="ghost"
                  compact
                  label="Remove download"
                  onPress={() => setRemove(entry.id)}
                />
              </View>
            </View>
          ))}
        </View>
      )}
      <ConfirmDialog
        visible={!!remove}
        title="Remove this download?"
        description="The downloaded file will be deleted. You can download it again later."
        confirm="Remove download"
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove)
            void app.downloads
              .remove(remove)
              .catch((error) => app.notify(String(error)));
          setRemove(null);
        }}
      />
    </>
  );
}
export function HistoryScreen() {
  const app = useApp();
  const t = useT();
  const width = useContentWidth();
  const [clear, setClear] = useState(false);
  return (
    <>
      <PageHeader
        title={t.history}
        eyebrow="THE STORIES YOU’VE SPENT TIME WITH"
        description="Your progress stays with your library."
        action={
          app.state.history.length ? (
            <Button icon={Trash2} onPress={() => setClear(true)}>
              Clear history
            </Button>
          ) : undefined
        }
      />
      {!app.state.history.length ? (
        <Empty
          icon={History}
          title="Every story leaves a trace"
          description="Play a movie or episode and your progress will be saved here."
        />
      ) : (
        <View style={{ gap: 12 }}>
          {app.state.history.map((entry) => (
            <Pressable
              key={mediaKey(entry.item)}
              accessibilityRole="button"
              onPress={() => void app.play(entry.item)}
              style={s.download}
            >
              <View style={s.thumbnail}>
                {entry.item.poster && (
                  <Image
                    source={imageSource(entry.item.poster)}
                    style={[
                      StyleSheet.absoluteFill,
                      { width: '100%', height: '100%' },
                    ]}
                  />
                )}
              </View>
              <View style={{ flex: 1, gap: 7 }}>
                <Text style={s.title}>{entry.item.title}</Text>
                <Text style={ui.muted}>
                  {time(entry.position)} / {time(entry.duration)} ·{' '}
                  {new Date(entry.updatedAt).toLocaleDateString()}
                </Text>
                <View style={s.progress}>
                  <View
                    style={{
                      width: `${Math.min(100, (entry.position / entry.duration) * 100)}%`,
                      height: 3,
                      backgroundColor: colors.accent,
                    }}
                  />
                </View>
              </View>
              <Play size={19} color={colors.accent} />
            </Pressable>
          ))}
        </View>
      )}
      <ConfirmDialog
        visible={clear}
        title="Clear watch history?"
        description="This removes playback progress for every title."
        confirm="Clear history"
        onCancel={() => setClear(false)}
        onConfirm={() => {
          app.library.update({ history: [] });
          setClear(false);
        }}
      />
    </>
  );
}
const s = StyleSheet.create({
  download: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbnail: {
    width: 94,
    height: 66,
    borderRadius: 7,
    backgroundColor: colors.raised,
    overflow: 'hidden',
  },
  title: { color: colors.text, fontSize: textSize(14), fontWeight: '600' },
  progress: {
    height: 3,
    backgroundColor: colors.raised,
    borderRadius: 3,
    overflow: 'hidden',
  },
});
