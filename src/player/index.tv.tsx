import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable as NativePressable,
  StyleSheet,
  Text,
  View,
  useTVEventHandler,
} from 'react-native';
import { useEvent, useEventListener } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Settings2,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-react-native';
import { useApp } from '../app-context';
import { platform } from '../platform';
import { Button, Chip } from '../ui/components';
import { Dialog } from '../ui/dialog';
import { FocusRegion } from '../ui/focus';
import { colors, time } from '../ui/theme';
import { artworkUri } from '../ui/artwork';
import { parseSubtitles, subtitleAt, type SubtitleCue } from './subtitles';
import { remotePlaybackAction } from './remote';

export function Player() {
  const { playback } = useApp();
  return playback ? (
    <TVPlayback
      key={JSON.stringify([
        playback.item.providerId,
        playback.item.id,
        !!playback.trailer,
      ])}
    />
  ) : null;
}

function TVPlayback() {
  const app = useApp();
  const playback = app.playback!;
  const view = useRef<VideoView>(null);
  const stage = useRef<View>(null);
  const position = useRef(playback.startAt);
  const duration = useRef(0);
  const lastSaved = useRef(0);
  const [controls, setControls] = useState(true);
  const [options, setOptions] = useState(false);
  const [interaction, setInteraction] = useState(0);
  const [currentTime, setCurrentTime] = useState(playback.startAt);
  const [trackRevision, setTrackRevision] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [problem, setProblem] = useState('');
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [subtitleId, setSubtitleId] = useState('');
  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.5;
    p.volume = app.state.settings.volume;
    p.muted = !!playback.trailer;
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = !playback.trailer;
  });
  const { status, error } = useEvent(player, 'statusChange', {
    status: player.status,
  });
  const { isPlaying } = useEvent(player, 'playingChange', {
    isPlaying: player.playing,
  });
  useEffect(() => {
    if (error || problem) setControls(true);
  }, [error, problem]);

  const showControls = () => {
    setControls(true);
    setInteraction((n) => n + 1);
  };
  function togglePlayback() {
    if (player.playing) {
      player.pause();
      showControls();
    } else {
      player.play();
      setInteraction((n) => n + 1);
    }
  }
  useTVEventHandler((event) => {
    const action = remotePlaybackAction(event, controls, options);
    if (action === 'toggle') togglePlayback();
    if (action === 'backward') player.seekBy(-10);
    if (action === 'forward') player.seekBy(10);
    if (action === 'show') showControls();
    if (
      controls &&
      event.eventKeyAction !== 1 &&
      !['focus', 'blur'].includes(event.eventType)
    )
      setInteraction((n) => n + 1);
  });
  useEffect(() => {
    if (
      !controls ||
      options ||
      !isPlaying ||
      status !== 'readyToPlay' ||
      problem
    )
      return;
    const timer = setTimeout(() => setControls(false), 6500);
    return () => clearTimeout(timer);
  }, [controls, options, isPlaying, interaction, status, problem]);
  useEffect(() => {
    if (!controls) stage.current?.requestTVFocus();
  }, [controls]);

  useEventListener(player, 'sourceLoad', () => {
    player.currentTime = position.current;
    duration.current = player.duration;
    const audio = player.availableAudioTracks.find(
      (t) => t.language === app.state.settings.audioLanguage,
    );
    if (audio) player.audioTrack = audio;
    const sidecar = playback.source.subtitles?.find(
      (t) => t.language === app.state.settings.subtitleLanguage,
    );
    setSubtitleId(sidecar?.id ?? '');
    player.subtitleTrack = sidecar
      ? null
      : (player.availableSubtitleTracks.find(
          (t) => t.language === app.state.settings.subtitleLanguage,
        ) ?? null);
    setTrackRevision((n) => n + 1);
  });
  useEventListener(player, 'timeUpdate', (event) => {
    position.current = event.currentTime;
    duration.current = player.duration;
    setCurrentTime(event.currentTime);
    if (playback.trailer && event.currentTime >= 45) {
      app.setPlayback(null);
      return;
    }
    if (!playback.trailer && Date.now() - lastSaved.current >= 5000) {
      lastSaved.current = Date.now();
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
    if (!playback.trailer && app.state.settings.autoplay) void app.next(1);
    else app.setPlayback(null);
  });
  useEffect(
    () => () => {
      if (!playback.trailer)
        app.library.recordProgress(
          playback.item,
          position.current,
          duration.current,
        );
    },
    [],
  );

  async function loadSource() {
    const resume = position.current;
    setProblem('');
    await player.replaceAsync({
      uri: playback.source.url,
      headers: playback.source.headers,
      contentType:
        playback.source.type === 'http' ? 'auto' : playback.source.type,
      metadata: {
        title: playback.item.title,
        artwork: artworkUri(playback.item.poster),
      },
    });
    player.currentTime = resume;
    player.playbackRate = speed;
    player.play();
  }
  useEffect(() => {
    let active = true;
    void loadSource().catch((e) => {
      if (active) setProblem(String(e));
    });
    return () => {
      active = false;
    };
  }, [playback.source.id, playback.source.url]);
  useEffect(() => {
    let active = true;
    setCues([]);
    const track = playback.source.subtitles?.find((t) => t.id === subtitleId);
    if (track) {
      player.subtitleTrack = null;
      void platform
        .request(track.url)
        .then((response) => {
          if (!response.ok) throw new Error('Subtitles could not be loaded.');
          if (active) setCues(parseSubtitles(response.body));
        })
        .catch((e) => {
          if (active) setProblem(String(e));
        });
    }
    return () => {
      active = false;
    };
  }, [subtitleId, playback.source.url]);

  const caption = subtitleAt(cues, currentTime);
  const failure = error?.message || problem;
  const progress =
    duration.current > 0
      ? Math.min(100, Math.max(0, (currentTime / duration.current) * 100))
      : 0;
  return (
    <Modal
      visible
      animationType="fade"
      onRequestClose={() =>
        options ? setOptions(false) : app.setPlayback(null)
      }
    >
      <View style={s.root}>
        <VideoView
          ref={view}
          player={player}
          style={StyleSheet.absoluteFill}
          nativeControls={false}
          fullscreenOptions={{ enable: false }}
          allowsPictureInPicture
          contentFit={
            playback.trailer && app.state.settings.cropTrailers
              ? 'cover'
              : 'contain'
          }
        />
        <NativePressable
          ref={stage}
          focusable={!controls && !options}
          hasTVPreferredFocus={!controls && !options}
          accessibilityLabel="Show playback controls"
          accessibilityRole="button"
          onPress={showControls}
          style={StyleSheet.absoluteFill}
        />
        {!!caption && (
          <View
            pointerEvents="none"
            style={[s.captions, { bottom: controls ? 310 : 75 }]}
          >
            <Text style={s.caption}>{caption}</Text>
          </View>
        )}
        {(controls || failure) && (
          <FocusRegion style={StyleSheet.absoluteFill}>
            <LinearGradient
              pointerEvents="none"
              colors={['#000b', '#0000', '#000e']}
              locations={[0, 0.35, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={s.heading}>
              <View style={{ flex: 1, gap: 12 }}>
                <Text style={s.eyebrow}>
                  {playback.trailer ? 'FILM PREVIEW' : 'NOW PLAYING'}
                </Text>
                <Text style={s.title}>{playback.item.title}</Text>
              </View>
              <Button
                icon={X}
                label="Close player"
                onPress={() => app.setPlayback(null)}
              />
            </View>
            <View style={s.controls}>
              {!!failure && (
                <View style={s.failure}>
                  <Text style={s.error}>{failure}</Text>
                  <Button
                    onPress={() =>
                      void loadSource().catch((e) => setProblem(String(e)))
                    }
                  >
                    Reload source
                  </Button>
                </View>
              )}
              <View style={s.track}>
                <View style={[s.progress, { width: `${progress}%` }]} />
              </View>
              <View style={s.times}>
                <Text style={s.time}>{time(currentTime)}</Text>
                <Text style={s.time}>{time(duration.current)}</Text>
              </View>
              <View
                style={s.buttons}
                onFocus={() => setInteraction((n) => n + 1)}
              >
                <Button
                  icon={SkipBack}
                  label="Previous title"
                  disabled={playback.index === 0 || playback.trailer}
                  onPress={() => void app.next(-1)}
                />
                <Button
                  icon={RotateCcw}
                  label="Back 10 seconds"
                  onPress={() => player.seekBy(-10)}
                />
                <Button
                  preferredFocus
                  variant="primary"
                  icon={isPlaying ? Pause : Play}
                  label={isPlaying ? 'Pause' : 'Play'}
                  onPress={togglePlayback}
                >
                  {isPlaying ? 'Pause' : 'Play'}
                </Button>
                <Button
                  icon={RotateCw}
                  label="Forward 10 seconds"
                  onPress={() => player.seekBy(10)}
                />
                <Button
                  icon={SkipForward}
                  label="Next title"
                  disabled={
                    playback.index >= playback.queue.length - 1 ||
                    playback.trailer
                  }
                  onPress={() => void app.next(1)}
                />
                <View style={{ flex: 1 }} />
                <Button
                  icon={PictureInPicture2}
                  label="Picture in picture"
                  onPress={() =>
                    void view.current
                      ?.startPictureInPicture()
                      .catch((e) => setProblem(String(e)))
                  }
                />
                <Button icon={Settings2} onPress={() => setOptions(true)}>
                  Playback options
                </Button>
              </View>
              <Text style={s.hint}>
                Play/Pause controls playback · Select shows controls ·
                Left/Right skips when controls are hidden · Back closes
              </Text>
            </View>
          </FocusRegion>
        )}
        {status === 'loading' && (
          <View pointerEvents="none" style={s.buffering}>
            <Text style={s.bufferText}>Loading video…</Text>
          </View>
        )}
        <Dialog
          visible={options}
          wide
          title="Playback options"
          onClose={() => {
            setOptions(false);
            showControls();
          }}
        >
          <Text style={s.section}>Source & quality</Text>
          <View style={s.choices}>
            {playback.sources.map((source) => (
              <Chip
                key={source.id}
                selected={source.id === playback.source.id}
                onPress={() => app.setPlayback((p) => p && { ...p, source })}
              >
                {source.label}
              </Chip>
            ))}
          </View>
          <Text style={s.section}>Speed</Text>
          <View style={s.choices}>
            {[0.5, 1, 1.5, 2].map((rate) => (
              <Chip
                key={rate}
                selected={speed === rate}
                onPress={() => {
                  player.playbackRate = rate;
                  setSpeed(rate);
                }}
              >
                {rate}×
              </Chip>
            ))}
          </View>
          <Text style={s.section}>Subtitles</Text>
          <View style={s.choices}>
            <Chip
              selected={!subtitleId && !player.subtitleTrack}
              onPress={() => {
                setSubtitleId('');
                player.subtitleTrack = null;
                setTrackRevision((n) => n + 1);
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
                key={'embedded:' + track.id}
                selected={player.subtitleTrack?.id === track.id}
                onPress={() => {
                  setSubtitleId('');
                  player.subtitleTrack = track;
                  setTrackRevision((n) => n + 1);
                }}
              >
                {track.label}
              </Chip>
            ))}
          </View>
          {player.availableAudioTracks.length > 1 && (
            <>
              <Text style={s.section}>Audio</Text>
              <View style={s.choices}>
                {player.availableAudioTracks.map((track) => (
                  <Chip
                    key={track.id}
                    selected={player.audioTrack?.id === track.id}
                    onPress={() => {
                      player.audioTrack = track;
                      setTrackRevision((n) => n + 1);
                    }}
                  >
                    {track.label}
                  </Chip>
                ))}
              </View>
            </>
          )}
          {playback.queue.length > 1 && (
            <>
              <Text style={s.section}>Up next</Text>
              {playback.queue.map((item, index) => (
                <Button
                  key={JSON.stringify([item.providerId, item.id])}
                  variant={index === playback.index ? 'primary' : 'secondary'}
                  onPress={() => void app.play(item, playback.queue)}
                >
                  {item.title}
                </Button>
              ))}
            </>
          )}
        </Dialog>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  heading: {
    position: 'absolute',
    top: 55,
    left: 75,
    right: 75,
    flexDirection: 'row',
    gap: 30,
    alignItems: 'center',
  },
  eyebrow: { color: colors.accent, fontSize: 19, letterSpacing: 3 },
  title: { color: colors.text, fontSize: 36, fontWeight: '600' },
  controls: { position: 'absolute', bottom: 55, left: 75, right: 75, gap: 16 },
  track: {
    height: 7,
    backgroundColor: '#ffffff45',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progress: { height: '100%', backgroundColor: colors.accent },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { color: colors.text, fontSize: 22, fontVariant: ['tabular-nums'] },
  buttons: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  hint: { fontSize: 19, color: '#bdc8d0', textAlign: 'center', marginTop: 8 },
  captions: {
    position: 'absolute',
    left: 150,
    right: 150,
    alignItems: 'center',
  },
  caption: {
    fontSize: 34,
    lineHeight: 45,
    color: '#fff',
    backgroundColor: '#000c',
    padding: 14,
    textAlign: 'center',
    borderRadius: 8,
  },
  buffering: {
    position: 'absolute',
    alignSelf: 'center',
    top: '43%',
    padding: 22,
    backgroundColor: '#000a',
    borderRadius: 12,
  },
  bufferText: { color: colors.text, fontSize: 26 },
  failure: {
    backgroundColor: '#291c20ee',
    padding: 24,
    borderRadius: 12,
    gap: 18,
  },
  error: { color: colors.danger, fontSize: 24 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  section: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '600',
    marginTop: 10,
  },
});
