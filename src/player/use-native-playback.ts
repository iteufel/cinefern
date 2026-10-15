import { useEffect, useRef, useState } from 'react';
import { useEvent, useEventListener } from 'expo';
import {
  useVideoPlayer,
  type AudioTrack,
  type SubtitleTrack,
} from 'expo-video';
import type { MediaSource } from '@cinefern/provider-sdk';
import { useApp } from '../app-context';
import { platform } from '../platform';
import { artworkUri } from '../ui/artwork';
import {
  preferredTrack,
  resolveAudioSource,
  sameTrack,
  trackKey,
} from './audio';
import { parseSubtitles, subtitleAt, type SubtitleCue } from './subtitles';
import { captureTransport, restoreTransport } from './transport';

export interface PlaybackChoice {
  id: string;
  label: string;
  selected: boolean;
}

// One playback implementation for iPhone, Apple TV and Android. In particular,
// changing a server audio rendition preserves position, pause state and speed.
export function useNativePlayback() {
  const app = useApp();
  const playback = app.playback!;
  const itemKey = JSON.stringify([
    playback.item.providerId,
    playback.item.id,
    !!playback.trailer,
  ]);
  const position = useRef(playback.startAt);
  const duration = useRef(0);
  const savedAt = useRef(0);
  const alive = useRef(true);
  const audioRequest = useRef(0);
  const replacing = useRef(true);
  const initialized = useRef(false);
  const audioLocked = useRef(false);
  const chosenAudio = useRef<AudioTrack | null>(null);
  const resume = useRef({ position: playback.startAt, playing: true, rate: 1 });
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState('');
  const [switchingAudio, setSwitchingAudio] = useState(false);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<SubtitleTrack[]>([]);
  const [selectedAudio, setSelectedAudio] = useState<AudioTrack | null>(null);
  const [selectedSubtitle, setSelectedSubtitle] =
    useState<SubtitleTrack | null>(null);
  const [sidecar, setSidecar] = useState<string | null>(null);
  const subtitleChoice = useRef<string | null>(null);
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [currentTime, setCurrentTime] = useState(playback.startAt);
  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.5;
    p.volume = app.state.settings.volume;
    p.muted = !!playback.trailer;
    p.staysActiveInBackground = true;
    p.showNowPlayingNotification = !playback.trailer;
    p.allowsExternalPlayback = true;
  });
  const { status, error } = useEvent(player, 'statusChange', {
    status: player.status,
  });
  const { isPlaying } = useEvent(player, 'playingChange', {
    isPlaying: player.playing,
  });
  const { playbackRate: speed } = useEvent(player, 'playbackRateChange', {
    playbackRate: player.playbackRate,
  });

  function updateAudio(tracks: AudioTrack[]) {
    setAudioTracks(tracks);
    if (!audioLocked.current) {
      const preferred =
        (chosenAudio.current &&
          tracks.find((track) => sameTrack(chosenAudio.current, track))) ||
        preferredTrack(
          tracks,
          chosenAudio.current?.language ||
            playback.source.audioLanguage ||
            app.state.settings.audioLanguage,
        );
      if (preferred) {
        audioLocked.current = true;
        player.audioTrack = preferred;
      }
    }
    setSelectedAudio(player.audioTrack);
  }
  useEventListener(player, 'sourceLoad', (event) => {
    duration.current = event.duration;
    updateAudio(event.availableAudioTracks);
    setSubtitleTracks(event.availableSubtitleTracks);
  });
  useEventListener(player, 'availableAudioTracksChange', (event) =>
    updateAudio(event.availableAudioTracks),
  );
  useEventListener(player, 'audioTrackChange', (event) => {
    setSelectedAudio(event.audioTrack);
    if (event.oldAudioTrack && !replacing.current) {
      audioLocked.current = true;
      chosenAudio.current = event.audioTrack;
    }
  });
  useEventListener(player, 'availableSubtitleTracksChange', (event) =>
    setSubtitleTracks(event.availableSubtitleTracks),
  );
  useEventListener(player, 'subtitleTrackChange', (event) => {
    setSelectedSubtitle(event.subtitleTrack);
    // A selection in AVKit's own menu takes precedence over sidecar captions.
    if (event.subtitleTrack) {
      subtitleChoice.current = 'native:' + trackKey(event.subtitleTrack);
      setSidecar(null);
    } else if (
      event.oldSubtitleTrack &&
      !replacing.current &&
      !subtitleChoice.current?.startsWith('external:')
    ) {
      subtitleChoice.current = 'off';
    }
  });
  useEventListener(player, 'timeUpdate', (event) => {
    if (replacing.current) return;
    position.current = event.currentTime;
    duration.current = player.duration;
    setCurrentTime(event.currentTime);
    if (playback.trailer && event.currentTime >= 45) app.setPlayback(null);
    if (!playback.trailer && Date.now() - savedAt.current >= 5000) {
      savedAt.current = Date.now();
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
  useEffect(() => {
    alive.current = true;
    initialized.current = false;
    chosenAudio.current = null;
    replacing.current = true;
    position.current = playback.startAt;
    duration.current = 0;
    resume.current = { position: playback.startAt, playing: true, rate: 1 };
    subtitleChoice.current = null;
    setSidecar(null);
    setCues([]);
    setCurrentTime(playback.startAt);
    setSwitchingAudio(false);
    player.muted = !!playback.trailer;
    player.showNowPlayingNotification = !playback.trailer;
    return () => {
      alive.current = false;
      audioRequest.current++;
      if (!playback.trailer)
        app.library.recordProgress(
          playback.item,
          position.current,
          duration.current,
        );
    };
  }, [itemKey]);

  const sourceKey = JSON.stringify([
    itemKey,
    playback.source.id,
    playback.source.url,
    playback.source.headers,
    playback.source.audioTrackId,
    reload,
  ]);
  const sourceGeneration = useRef(0);
  const loadQueue = useRef(Promise.resolve());
  useEffect(() => {
    const generation = ++sourceGeneration.current;
    replacing.current = true;
    audioLocked.current = false;
    setLoading(true);
    setProblem('');
    setAudioTracks([]);
    setSubtitleTracks([]);
    setSelectedAudio(null);
    setSelectedSubtitle(null);
    const snapshot = { ...resume.current };
    loadQueue.current = loadQueue.current
      .catch(() => {})
      .then(async () => {
        if (!alive.current || generation !== sourceGeneration.current) return;
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
        if (!alive.current || generation !== sourceGeneration.current) return;
        restoreTransport(player, snapshot);
        position.current = snapshot.position;
        initialized.current = true;
        replacing.current = false;
        setLoading(false);
      })
      .catch((e) => {
        if (!alive.current || generation !== sourceGeneration.current) return;
        replacing.current = false;
        setLoading(false);
        setProblem(String(e).replace(/^Error: /, ''));
      });
    return () => {
      sourceGeneration.current++;
    };
  }, [sourceKey]);

  function captureResume() {
    if (initialized.current && !replacing.current)
      resume.current = captureTransport(player);
  }
  function selectSource(source: MediaSource, sources = playback.sources) {
    audioRequest.current++;
    setSwitchingAudio(false);
    captureResume();
    app.setPlayback((p) =>
      p && p.item === playback.item ? { ...p, source, sources } : p,
    );
  }
  function retry() {
    captureResume();
    setReload((n) => n + 1);
  }

  const useServerAudio =
    (playback.source.audioTracks?.length ?? 0) > 1 &&
    (playback.source.type === 'hls' || audioTracks.length <= 1);
  const audioChoices: PlaybackChoice[] = useServerAudio
    ? playback.source.audioTracks!.map((track) => ({
        id: 'server:' + track.id,
        label: track.label,
        selected: playback.source.audioTrackId === track.id,
      }))
    : audioTracks.map((track) => ({
        id: 'native:' + trackKey(track),
        label: track.label || track.language,
        selected: sameTrack(selectedAudio, track),
      }));
  async function selectAudio(id: string) {
    if (switchingAudio || loading) return;
    if (id.startsWith('native:')) {
      const track = audioTracks.find(
        (track) => 'native:' + trackKey(track) === id,
      );
      if (track) {
        audioLocked.current = true;
        chosenAudio.current = track;
        player.audioTrack = track;
        setSelectedAudio(track);
      }
      return;
    }
    const track = playback.source.audioTracks?.find(
      (track) => 'server:' + track.id === id,
    );
    if (!track || track.id === playback.source.audioTrackId) return;
    const request = ++audioRequest.current;
    setSwitchingAudio(true);
    setProblem('');
    try {
      const resolved = await resolveAudioSource(
        (preferences) =>
          app.runtime.call<MediaSource[]>(
            playback.item.providerId,
            'getSources',
            [playback.item.id, preferences],
          ),
        app.state.settings,
        playback.source,
        track,
      );
      if (!alive.current || request !== audioRequest.current) return;
      chosenAudio.current = null;
      selectSource(resolved.source, resolved.sources);
    } catch (e) {
      if (alive.current && request === audioRequest.current)
        setProblem(String(e).replace(/^Error: /, ''));
    } finally {
      if (alive.current && request === audioRequest.current)
        setSwitchingAudio(false);
    }
  }

  useEffect(() => {
    const choice = subtitleChoice.current;
    if (choice === 'off') {
      player.subtitleTrack = null;
      setSidecar(null);
      return;
    }
    const external = playback.source.subtitles?.find((track) =>
      choice
        ? choice === 'external:' + track.id
        : !!preferredTrack([track], app.state.settings.subtitleLanguage),
    );
    if (external) {
      player.subtitleTrack = null;
      setSidecar(external.id);
      return;
    }
    const embedded = choice
      ? subtitleTracks.find((track) => choice === 'native:' + trackKey(track))
      : preferredTrack(subtitleTracks, app.state.settings.subtitleLanguage);
    if (embedded) {
      player.subtitleTrack = embedded;
      setSidecar(null);
    }
  }, [subtitleTracks, sourceKey]);
  useEffect(() => {
    let active = true;
    setCues([]);
    const track = playback.source.subtitles?.find((t) => t.id === sidecar);
    if (track)
      void platform
        .request(track.url)
        .then((response) => {
          if (!response.ok) throw new Error('Subtitles could not be loaded.');
          if (active) setCues(parseSubtitles(response.body));
        })
        .catch((e) => {
          if (active) setProblem(String(e));
        });
    return () => {
      active = false;
    };
  }, [sidecar, sourceKey]);
  const subtitleChoices: PlaybackChoice[] = [
    { id: 'off', label: 'Off', selected: !sidecar && !selectedSubtitle },
    ...(playback.source.subtitles ?? []).map((track) => ({
      id: 'external:' + track.id,
      label: track.label,
      selected: sidecar === track.id,
    })),
    ...subtitleTracks.map((track) => ({
      id: 'native:' + trackKey(track),
      label: track.label || track.language,
      selected: sameTrack(selectedSubtitle, track),
    })),
  ];
  function selectSubtitle(id: string) {
    subtitleChoice.current = id;
    setSidecar(null);
    player.subtitleTrack = null;
    setSelectedSubtitle(null);
    if (id.startsWith('external:')) setSidecar(id.slice(9));
    if (id.startsWith('native:')) {
      const track = subtitleTracks.find(
        (track) => 'native:' + trackKey(track) === id,
      );
      if (track) {
        player.subtitleTrack = track;
        setSelectedSubtitle(track);
      }
    }
    // Native change events can arrive during the setter; retain the explicit choice.
    subtitleChoice.current = id;
  }
  return {
    player,
    status,
    isPlaying,
    speed,
    currentTime,
    loading: loading || status === 'loading',
    switchingAudio,
    failure: problem || error?.message || '',
    caption: subtitleAt(cues, currentTime),
    audioChoices,
    subtitleChoices,
    selectAudio,
    selectSubtitle,
    selectSource,
    retry,
  };
}
