import React, { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer, VideoView, VideoAirPlayButton } from 'expo-video';
import {
  Maximize,
  PictureInPicture2,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '../app-context';
import { Button, Chip, Loading, styles as ui } from '../ui/components';
import { colors } from '../ui/theme';
import { useT } from '../ui/i18n';
import { platform } from '../platform';
import { parseSubtitles, subtitleAt, type SubtitleCue } from './subtitles';
import { artworkUri } from '../ui/artwork';

export function Player() {
  const app = useApp();
  const playback = app.playback;
  if (!playback) return null;
  return (
    <NativePlayback
      key={
        playback.item.providerId +
        ':' +
        playback.item.id +
        ':' +
        Boolean(playback.trailer)
      }
    />
  );
}
function NativePlayback() {
  const app = useApp();
  const playback = app.playback!;
  const t = useT();
  const view = useRef<VideoView>(null);
  const lastProgress = useRef(0);
  const position = useRef(playback.startAt);
  const duration = useRef(0);
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [subtitle, setSubtitle] = useState('');
  const [subtitleId, setSubtitleId] = useState(
    playback.source.subtitles?.find(
      (s) => s.language === app.state.settings.subtitleLanguage,
    )?.id ?? '',
  );
  const [trackRevision, setTrackRevision] = useState(0);
  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 1;
    p.volume = app.state.settings.volume;
    p.muted = !!playback.trailer;
    p.showNowPlayingNotification = !playback.trailer;
    p.staysActiveInBackground = true;
    p.allowsExternalPlayback = true;
    p.play();
  });
  const { status, error } = useEvent(player, 'statusChange', {
    status: player.status,
    error: undefined,
  });
  useEventListener(player, 'sourceLoad', () => {
    player.currentTime = position.current;
    const audio = player.availableAudioTracks.find(
      (track) => track.language === app.state.settings.audioLanguage,
    );
    if (audio) player.audioTrack = audio;
    const text = player.availableSubtitleTracks.find(
      (track) => track.language === app.state.settings.subtitleLanguage,
    );
    player.subtitleTrack = text ?? null;
    setTrackRevision((r) => r + 1);
  });
  useEventListener(player, 'timeUpdate', (event) => {
    position.current = event.currentTime;
    duration.current = player.duration;
    setSubtitle(subtitleAt(cues, event.currentTime));
    if (playback.trailer && event.currentTime >= 45) {
      app.setPlayback(null);
      return;
    }
    if (!playback.trailer && Date.now() - lastProgress.current >= 5000) {
      lastProgress.current = Date.now();
      app.library.recordProgress(
        playback.item,
        event.currentTime,
        player.duration,
      );
    }
  });
  useEventListener(player, 'playToEnd', () => {
    if (!playback.trailer)
      app.library.recordProgress(
        playback.item,
        player.duration,
        player.duration,
      );
    if (app.state.settings.autoplay && !playback.trailer) void app.next(1);
    else app.setPlayback(null);
  });
  useEffect(() => {
    return () => {
      if (!playback.trailer)
        app.library.recordProgress(
          playback.item,
          position.current,
          duration.current,
        );
    };
  }, []);
  const lastUrl = useRef('');
  useEffect(() => {
    if (lastUrl.current === playback.source.url) return;
    lastUrl.current = playback.source.url;
    const resumeAt = position.current;
    void player
      .replaceAsync({
        uri: playback.source.url,
        headers: playback.source.headers,
        contentType:
          playback.source.type === 'http' ? 'auto' : playback.source.type,
        metadata: {
          title: playback.item.title,
          artwork: artworkUri(playback.item.poster),
        },
      })
      .then(() => {
        player.currentTime = resumeAt;
        player.play();
      })
      .catch((error) => app.notify(String(error)));
  }, [playback.source.url]);
  useEffect(() => {
    let active = true;
    setCues([]);
    setSubtitle('');
    const selected = playback.source.subtitles?.find(
      (s) => s.id === subtitleId,
    );
    if (selected) {
      player.subtitleTrack = null;
      void platform
        .request(selected.url)
        .then((response) => {
          if (!response.ok) throw new Error('Subtitles could not be loaded.');
          if (active) setCues(parseSubtitles(response.body));
        })
        .catch((error) => app.notify(String(error)));
    }
    return () => {
      active = false;
    };
  }, [subtitleId, playback.source.url]);
  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={() => app.setPlayback(null)}
    >
      <SafeAreaView style={s.root}>
        <View style={s.header}>
          <View style={{ flex: 1, gap: 5 }}>
            <Text style={ui.eyebrow}>
              {playback.trailer ? 'FILM PREVIEW' : 'NOW PLAYING'}
            </Text>
            <Text style={s.title}>{playback.item.title}</Text>
          </View>
          <Button
            icon={X}
            variant="ghost"
            label="Close player"
            onPress={() => app.setPlayback(null)}
          />
        </View>
        <View style={s.videoWrap}>
          <VideoView
            ref={view}
            player={player}
            style={s.video}
            nativeControls
            fullscreenOptions={{ enable: true }}
            contentFit={
              playback.trailer && app.state.settings.cropTrailers
                ? 'cover'
                : 'contain'
            }
            allowsPictureInPicture
            startsPictureInPictureAutomatically
          />
          {subtitle ? (
            <View pointerEvents="none" style={s.subtitle}>
              <Text style={s.subtitleText}>{subtitle}</Text>
            </View>
          ) : null}
          {status === 'loading' && (
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { alignItems: 'center', justifyContent: 'center' },
              ]}
            >
              <Loading />
            </View>
          )}
        </View>
        {error && (
          <View style={{ padding: 20, gap: 12 }}>
            <Text style={{ color: colors.danger }}>{error.message}</Text>
            <Button
              onPress={() =>
                void player
                  .replaceAsync(playback.source.url)
                  .then(() => player.play())
                  .catch((e) => app.notify(String(e)))
              }
            >
              Reload source
            </Button>
          </View>
        )}
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <Button
              icon={SkipBack}
              disabled={playback.index === 0}
              label="Previous title"
              onPress={() => void app.next(-1)}
            />
            <Button
              icon={RotateCcw}
              label="Back 10 seconds"
              onPress={() => player.seekBy(-10)}
            />
            <Button
              icon={RotateCw}
              label="Forward 10 seconds"
              onPress={() => player.seekBy(10)}
            />
            <Button
              icon={SkipForward}
              disabled={playback.index >= playback.queue.length - 1}
              label="Next title"
              onPress={() => void app.next(1)}
            />
            <Button
              icon={Maximize}
              label="Fullscreen"
              onPress={() =>
                void view.current
                  ?.enterFullscreen()
                  .catch((error) => app.notify(String(error)))
              }
            />
            <Button
              icon={PictureInPicture2}
              label="Picture in picture"
              onPress={() =>
                void view.current
                  ?.startPictureInPicture()
                  .catch((error) => app.notify(String(error)))
              }
            />
            {platform.name === 'iOS' && (
              <VideoAirPlayButton
                style={{ width: 44, height: 44 }}
                tint={colors.accent}
              />
            )}
          </View>
          <Text style={ui.eyebrow}>SOURCE & QUALITY</Text>
          <ScrollView horizontal contentContainerStyle={{ gap: 9 }}>
            {playback.sources.map((source) => (
              <Chip
                key={source.id}
                selected={source.id === playback.source.id}
                onPress={() => app.setPlayback((p) => p && { ...p, source })}
              >
                {source.label}
              </Chip>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[0.5, 1, 1.5, 2].map((speed) => (
              <Chip
                key={speed}
                onPress={() => {
                  player.playbackRate = speed;
                }}
              >
                {speed}×
              </Chip>
            ))}
          </View>
          {!!(
            playback.source.subtitles?.length ||
            player.availableSubtitleTracks.length
          ) && (
            <>
              <Text style={ui.eyebrow}>SUBTITLES</Text>
              <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
                <Chip
                  onPress={() => {
                    setSubtitleId('');
                    player.subtitleTrack = null;
                  }}
                >
                  Off
                </Chip>
                {playback.source.subtitles?.map((track) => (
                  <Chip
                    key={track.id}
                    selected={subtitleId === track.id}
                    onPress={() => setSubtitleId(track.id)}
                  >
                    {track.label}
                  </Chip>
                ))}
                {player.availableSubtitleTracks.map((track) => (
                  <Chip
                    key={track.id}
                    onPress={() => {
                      setSubtitleId('');
                      player.subtitleTrack = track;
                    }}
                  >
                    {track.label}
                  </Chip>
                ))}
              </ScrollView>
            </>
          )}
          {player.availableAudioTracks.length > 1 && (
            <>
              <Text style={ui.eyebrow}>AUDIO</Text>
              <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
                {player.availableAudioTracks.map((track) => (
                  <Chip
                    key={track.id}
                    onPress={() => {
                      player.audioTrack = track;
                    }}
                  >
                    {track.label}
                  </Chip>
                ))}
              </ScrollView>
            </>
          )}
          {playback.queue.length > 1 && (
            <>
              <Text style={ui.eyebrow}>{t.queue.toUpperCase()}</Text>
              {playback.queue.map((item, i) => (
                <Button
                  key={item.id}
                  variant={i === playback.index ? 'primary' : 'ghost'}
                  onPress={() => void app.play(item, playback.queue)}
                >
                  {item.title}
                </Button>
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12 },
  title: { color: colors.text, fontSize: 19, fontWeight: '600' },
  videoWrap: {
    position: 'relative',
    backgroundColor: '#000',
    width: '100%',
    aspectRatio: 16 / 9,
  },
  video: { width: '100%', height: '100%' },
  subtitle: {
    position: 'absolute',
    bottom: 45,
    left: 15,
    right: 15,
    alignItems: 'center',
  },
  subtitleText: {
    color: '#fff',
    fontSize: 17,
    backgroundColor: '#000b',
    padding: 7,
    textAlign: 'center',
  },
});
