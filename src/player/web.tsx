import React, { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Maximize,
  PictureInPicture2,
  Pin,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
  X,
} from 'lucide-react-native';
import type Hls from 'hls.js';
import type { MediaPlayerClass } from 'dashjs';
import { useApp } from '../app-context';
import { platform } from '../platform';
import { Button, Chip, styles as ui } from '../ui/components';
import { colors, glass, radius, time } from '../ui/theme';
import { useT } from '../ui/i18n';
import { parseSubtitles } from './subtitles';
import { artworkUri } from '../ui/artwork';

export function Player() {
  const app = useApp();
  if (!app.playback) return null;
  return (
    <WebPlayback
      key={
        app.playback.item.providerId +
        ':' +
        app.playback.item.id +
        ':' +
        Boolean(app.playback.trailer)
      }
    />
  );
}
function WebPlayback() {
  const app = useApp();
  const playback = app.playback!;
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const hls = useRef<Hls | null>(null);
  const dash = useRef<MediaPlayerClass | null>(null);
  const stateRef = useRef(app);
  stateRef.current = app;
  const lastProgress = useRef(0);
  const position = useRef(playback.startAt);
  const duration = useRef(0);
  const floatingRef = useRef(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [floating, setFloating] = useState(false);
  const [tracks, setTracks] = useState<Array<{ id: number; label: string }>>(
    [],
  );
  const [speed, setSpeed] = useState(1);
  const [subtitleId, setSubtitleId] = useState(
    playback.source.subtitles?.find(
      (s) => s.language === app.state.settings.subtitleLanguage,
    )?.id ?? '',
  );
  const [subtitles, setSubtitles] = useState<
    Array<{ id: string; uri: string; language: string; label: string }>
  >([]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let active = true;
    let prepared: { uri: string; dispose(): Promise<void> } | undefined;
    setError('');
    element.volume = app.state.settings.volume;
    element.muted = !!playback.trailer;
    const src = playback.source;
    async function attach() {
      if (src.type === 'hls') {
        const { default: Hls } = await import('hls.js');
        if (!active) return;
        if (Hls.isSupported()) {
          const adapter = new Hls({
            xhrSetup: (xhr) => {
              for (const [key, value] of Object.entries(src.headers ?? {}))
                xhr.setRequestHeader(key, value);
            },
          });
          hls.current = adapter;
          adapter.attachMedia(element!);
          adapter.loadSource(src.url);
          adapter.on(Hls.Events.ERROR, (_, event) => {
            if (event.fatal && active)
              setError('HLS playback failed: ' + event.details);
          });
          adapter.on(Hls.Events.MANIFEST_PARSED, () => {
            const audio = adapter.audioTracks;
            const preferred = audio.findIndex(
              (track) => track.lang === app.state.settings.audioLanguage,
            );
            if (preferred >= 0) adapter.audioTrack = preferred;
            setTracks(
              audio.map((track, i) => ({
                id: i,
                label: track.name || track.lang || 'Audio ' + (i + 1),
              })),
            );
            const subtitle = adapter.subtitleTracks.findIndex(
              (track) => track.lang === app.state.settings.subtitleLanguage,
            );
            adapter.subtitleTrack = subtitle;
          });
        } else if (element!.canPlayType('application/vnd.apple.mpegurl'))
          element!.src = src.url;
        else throw new Error('This browser does not support HLS.');
      } else if (src.type === 'dash') {
        const Dash = await import('dashjs');
        if (!active) return;
        const adapter = Dash.MediaPlayer().create();
        dash.current = adapter;
        adapter.updateSettings({
          streaming: { abr: { limitBitrateByPortal: true } },
        });
        if (src.headers)
          adapter.extend(
            'RequestModifier',
            () => ({
              modifyRequestHeader: (xhr: XMLHttpRequest) => {
                for (const [key, value] of Object.entries(src.headers!))
                  xhr.setRequestHeader(key, value);
                return xhr;
              },
              modifyRequestURL: (url: string) => url,
            }),
            true,
          );
        adapter.initialize(element!, src.url, true);
        adapter.on(Dash.MediaPlayer.events.ERROR, (event) => {
          if (active)
            setError('DASH playback failed. Reload or choose another source.');
        });
        adapter.on(Dash.MediaPlayer.events.STREAM_INITIALIZED, () => {
          const audio = adapter.getTracksFor('audio');
          const preferred = audio.find(
            (track) => track.lang === app.state.settings.audioLanguage,
          );
          if (preferred) adapter.setCurrentTrack(preferred);
          setTracks(
            audio.map((track, i) => ({
              id: i,
              label: track.lang || 'Audio ' + (i + 1),
            })),
          );
          const text = adapter.getTracksFor('text');
          const subtitle = text.findIndex(
            (track) => track.lang === app.state.settings.subtitleLanguage,
          );
          adapter.setTextTrack(subtitle);
        });
      } else {
        // HTML video cannot attach custom HTTP headers; use a tokenized URL or HLS/DASH transport.
        if (src.headers && Object.keys(src.headers).length) {
          if (!platform.prepareFilePlayback)
            throw new Error(
              'File playback with custom headers requires a signed URL in the web preview. Use desktop/native or choose an HLS/DASH source.',
            );
          prepared = await platform.prepareFilePlayback(src.url, src.headers);
          if (!active) {
            await prepared.dispose();
            return;
          }
          element!.src = prepared.uri;
        } else element!.src = src.url;
      }
    }
    const metadata = () => {
      if (Number.isFinite(element.duration))
        element.currentTime = Math.min(
          position.current,
          Math.max(0, element.duration - 1),
        );
      void element.play().catch(() => {});
    };
    element.addEventListener('loadedmetadata', metadata);
    void attach().catch((error) => {
      if (active) setError(String(error).replace(/^Error: /, ''));
    });
    return () => {
      active = false;
      element.removeEventListener('loadedmetadata', metadata);
      position.current = element.currentTime;
      hls.current?.destroy();
      hls.current = null;
      dash.current?.reset();
      dash.current = null;
      element.pause();
      element.removeAttribute('src');
      element.load();
      void prepared?.dispose();
    };
  }, [playback.source.url, reload]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const update = () => {
      position.current = element.currentTime;
      duration.current = element.duration;
      if (playback.trailer && element.currentTime >= 45) {
        stateRef.current.setPlayback(null);
        return;
      }
      if (!playback.trailer && Date.now() - lastProgress.current >= 5000) {
        lastProgress.current = Date.now();
        app.library.recordProgress(
          playback.item,
          element.currentTime,
          element.duration,
        );
      }
    };
    const ended = () => {
      if (!playback.trailer)
        app.library.recordProgress(
          playback.item,
          element.duration,
          element.duration,
        );
      if (stateRef.current.state.settings.autoplay && !playback.trailer)
        void stateRef.current.next(1);
      else app.setPlayback(null);
    };
    const failed = () =>
      setError(
        element.error?.message ||
          'This source could not be played. Reload it or choose another source.',
      );
    const keydown = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement)?.matches(
          'input,textarea,select,[contenteditable=true]',
        )
      )
        return;
      if (
        ['Space', 'ArrowRight', 'ArrowLeft', 'KeyF', 'KeyM', 'Escape'].includes(
          event.code,
        )
      )
        event.preventDefault();
      switch (event.code) {
        case 'Space':
          if (element.paused) void element.play().catch(() => {});
          else element.pause();
          break;
        case 'ArrowRight':
          element.currentTime = Math.min(
            element.duration || Infinity,
            element.currentTime + 10,
          );
          break;
        case 'ArrowLeft':
          element.currentTime = Math.max(0, element.currentTime - 10);
          break;
        case 'KeyM':
          element.muted = !element.muted;
          break;
        case 'KeyF':
          if (document.fullscreenElement) void document.exitFullscreen();
          else
            void element
              .requestFullscreen()
              .catch((e) => app.notify(String(e)));
          break;
        case 'Escape':
          if (!document.fullscreenElement) app.setPlayback(null);
          break;
      }
    };
    const volume = () => app.library.setSettings({ volume: element.volume });
    const wheel = (event: WheelEvent) => {
      if (!stateRef.current.state.settings.scrollVolume) return;
      event.preventDefault();
      element.volume = Math.max(
        0,
        Math.min(1, element.volume - event.deltaY / 1000),
      );
    };
    element.addEventListener('timeupdate', update);
    element.addEventListener('ended', ended);
    element.addEventListener('error', failed);
    element.addEventListener('volumechange', volume);
    element.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', keydown);
    return () => {
      if (!playback.trailer)
        app.library.recordProgress(
          playback.item,
          position.current,
          duration.current,
        );
      element.removeEventListener('timeupdate', update);
      element.removeEventListener('ended', ended);
      element.removeEventListener('error', failed);
      element.removeEventListener('volumechange', volume);
      element.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keydown);
      if (floatingRef.current) void platform.setAlwaysOnTop?.(false);
      if (playback.source.url.startsWith('blob:'))
        URL.revokeObjectURL(playback.source.url);
    };
  }, []);
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: playback.item.title,
      artist: 'Cinefern',
      artwork: playback.item.poster
        ? [{ src: artworkUri(playback.item.poster)! }]
        : [],
    });
    const actions: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', () => void video.current?.play()],
      ['pause', () => video.current?.pause()],
      [
        'seekbackward',
        () => {
          if (video.current)
            video.current.currentTime = Math.max(
              0,
              video.current.currentTime - 10,
            );
        },
      ],
      [
        'seekforward',
        () => {
          if (video.current) video.current.currentTime += 10;
        },
      ],
      [
        'seekto',
        (details) => {
          if (video.current && details.seekTime !== undefined)
            video.current.currentTime = details.seekTime;
        },
      ],
      ['previoustrack', () => void stateRef.current.next(-1)],
      ['nexttrack', () => void stateRef.current.next(1)],
    ];
    for (const [action, handler] of actions) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {}
    }
    return () => {
      for (const [action] of actions) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {}
      }
      navigator.mediaSession.metadata = null;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const uris: string[] = [];
    setSubtitles([]);
    void Promise.all(
      (playback.source.subtitles ?? []).map(async (track) => {
        const response = await platform.request(track.url);
        if (!response.ok)
          throw new Error('Could not load subtitles: ' + track.label);
        const text =
          'WEBVTT\n\n' +
          parseSubtitles(response.body)
            .map(
              (cue, i) =>
                i +
                '\n' +
                formatVtt(cue.start) +
                ' --> ' +
                formatVtt(cue.end) +
                '\n' +
                cue.text,
            )
            .join('\n\n');
        const uri = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }));
        uris.push(uri);
        return {
          id: track.id,
          uri,
          language: track.language,
          label: track.label,
        };
      }),
    )
      .then((tracks) => {
        if (active) setSubtitles(tracks);
        else uris.forEach((uri) => URL.revokeObjectURL(uri));
      })
      .catch((error) => app.notify(String(error)));
    return () => {
      active = false;
      uris.forEach((uri) => URL.revokeObjectURL(uri));
    };
  }, [playback.source.url]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    for (let i = 0; i < element.textTracks.length; i++)
      element.textTracks[i]!.mode =
        subtitles[i]?.id === subtitleId ? 'showing' : 'disabled';
  }, [subtitleId, subtitles]);
  async function pip() {
    try {
      if (document.pictureInPictureElement)
        await document.exitPictureInPicture();
      else await video.current?.requestPictureInPicture();
    } catch (error) {
      app.notify(String(error));
    }
  }
  async function float() {
    const next = !floating;
    await platform.setAlwaysOnTop?.(next);
    floatingRef.current = next;
    setFloating(next);
  }
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => app.setPlayback(null)}
    >
      <View style={s.overlay}>
        <View style={s.panel}>
          <View style={s.header}>
            <View style={{ flex: 1, gap: 6 }}>
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
          <video
            ref={video}
            controls
            autoPlay
            playsInline
            aria-label={'Playing ' + playback.item.title}
            style={{
              width: '100%',
              maxHeight: '55vh',
              aspectRatio: '16 / 9',
              backgroundColor: '#000',
              objectFit:
                playback.trailer && app.state.settings.cropTrailers
                  ? 'cover'
                  : 'contain',
            }}
          >
            {subtitles.map((track) => (
              <track
                key={track.id}
                src={track.uri}
                kind="subtitles"
                srcLang={track.language}
                label={track.label}
                default={track.id === subtitleId}
              />
            ))}
          </video>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 17 }}>
            {!!error && (
              <View style={{ gap: 12 }}>
                <Text style={{ color: colors.danger, fontSize: 13 }}>
                  {error}
                </Text>
                <Button onPress={() => setReload((r) => r + 1)}>
                  Reload source
                </Button>
              </View>
            )}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 9,
              }}
            >
              <View style={{ flexDirection: 'row', gap: 7 }}>
                <Button
                  icon={SkipBack}
                  compact
                  label="Previous title"
                  disabled={playback.index === 0}
                  onPress={() => void app.next(-1)}
                />
                <Button
                  icon={RotateCcw}
                  compact
                  label="Back 10 seconds"
                  onPress={() => {
                    if (video.current)
                      video.current.currentTime = Math.max(
                        0,
                        video.current.currentTime - 10,
                      );
                  }}
                />
                <Button
                  icon={RotateCw}
                  compact
                  label="Forward 10 seconds"
                  onPress={() => {
                    if (video.current) video.current.currentTime += 10;
                  }}
                />
                <Button
                  icon={SkipForward}
                  compact
                  label="Next title"
                  disabled={playback.index === playback.queue.length - 1}
                  onPress={() => void app.next(1)}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 7 }}>
                <Button
                  icon={PictureInPicture2}
                  compact
                  label="Picture in picture"
                  onPress={() => void pip()}
                />
                <Button
                  icon={Maximize}
                  compact
                  label="Fullscreen"
                  onPress={() =>
                    void video.current
                      ?.requestFullscreen()
                      .catch((error) => app.notify(String(error)))
                  }
                />
                {platform.setAlwaysOnTop && (
                  <Button
                    icon={Pin}
                    compact
                    label="Float on top"
                    variant={floating ? 'primary' : 'secondary'}
                    onPress={() => void float()}
                  />
                )}
              </View>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {playback.sources.map((source) => (
                <Chip
                  key={source.id}
                  selected={source.id === playback.source.id}
                  onPress={() => app.setPlayback((p) => p && { ...p, source })}
                >
                  {source.label}
                </Chip>
              ))}
              {[0.5, 1, 1.5, 2].map((value) => (
                <Chip
                  key={value}
                  selected={speed === value}
                  onPress={() => {
                    setSpeed(value);
                    if (video.current) video.current.playbackRate = value;
                  }}
                >
                  {value}×
                </Chip>
              ))}
            </ScrollView>
            {!!subtitles.length && (
              <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
                <Text style={[ui.muted, { alignSelf: 'center' }]}>
                  Subtitles
                </Text>
                <Chip selected={!subtitleId} onPress={() => setSubtitleId('')}>
                  Off
                </Chip>
                {subtitles.map((track) => (
                  <Chip
                    key={track.id}
                    selected={subtitleId === track.id}
                    onPress={() => setSubtitleId(track.id)}
                  >
                    {track.label}
                  </Chip>
                ))}
              </ScrollView>
            )}
            {tracks.length > 1 && (
              <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
                <Text style={[ui.muted, { alignSelf: 'center' }]}>Audio</Text>
                {tracks.map((track) => (
                  <Chip
                    key={track.id}
                    onPress={() => {
                      if (hls.current) hls.current.audioTrack = track.id;
                      if (dash.current) {
                        const audio =
                          dash.current.getTracksFor('audio')[track.id];
                        if (audio) dash.current.setCurrentTrack(audio);
                      }
                    }}
                  >
                    {track.label}
                  </Chip>
                ))}
              </ScrollView>
            )}
            {playback.queue.length > 1 && (
              <>
                <Text style={ui.eyebrow}>{t.queue.toUpperCase()}</Text>
                <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
                  {playback.queue.map((item, i) => (
                    <Chip
                      key={item.id}
                      selected={i === playback.index}
                      onPress={() => void app.play(item, playback.queue)}
                    >
                      {item.title}
                    </Chip>
                  ))}
                </ScrollView>
              </>
            )}
            <Text style={{ color: colors.subtle, fontSize: 10 }}>
              Space · play/pause ← → · seek 10s F · fullscreen M · mute Esc ·
              close
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
function formatVtt(value: number) {
  const ms = Math.round(value * 1000);
  return (
    String(Math.floor(ms / 3_600_000)).padStart(2, '0') +
    ':' +
    String(Math.floor(ms / 60_000) % 60).padStart(2, '0') +
    ':' +
    String(Math.floor(ms / 1000) % 60).padStart(2, '0') +
    '.' +
    String(ms % 1000).padStart(3, '0')
  );
}
const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#000000db',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
  },
  panel: {
    width: '100%',
    maxWidth: 1060,
    maxHeight: '96%',
    ...glass,
    borderRadius: radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 15, padding: 20 },
  title: { color: colors.text, fontSize: 18, fontWeight: '600' },
});
