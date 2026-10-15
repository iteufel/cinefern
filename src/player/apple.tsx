import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { VideoView } from 'expo-video';
import { X } from 'lucide-react-native';
import { PlayerMenus, type PlayerMenuGroup } from '@cinefern/apple-player';
import { useApp } from '../app-context';
import { Button } from '../ui/components';
import { NativeGlass } from '../ui/glass-view';
import { isTV } from '../ui/theme';
import { useNativePlayback } from './use-native-playback';

export function Player({ embedded = false }: { embedded?: boolean }) {
  const { playback } = useApp();
  return playback ? <ApplePlayback embedded={embedded} /> : null;
}

function ApplePlayback({ embedded }: { embedded: boolean }) {
  const app = useApp();
  const playback = app.playback!;
  const state = useNativePlayback();
  const view = useRef<VideoView>(null);
  const entered = useRef(false);
  const pictureInPicture = useRef(false);
  const [shown, setShown] = useState(false);
  const [attached, setAttached] = useState(false);
  const [idle, setIdle] = useState(false);
  const [interaction, setInteraction] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const headerOpacity = useRef(new Animated.Value(1)).current;
  const showControls = useCallback(() => {
    setIdle(false);
    setInteraction((value) => value + 1);
  }, []);
  const controlsVisible =
    !idle ||
    !state.isPlaying ||
    state.loading ||
    !!state.failure ||
    menuOpen ||
    screenReader;
  useEffect(() => {
    if (isTV) return;
    let active = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (active) setScreenReader(enabled);
    });
    const listener = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setScreenReader,
    );
    return () => {
      active = false;
      listener.remove();
    };
  }, []);
  useEffect(() => {
    if (isTV) return;
    setIdle(false);
    if (
      !state.isPlaying ||
      state.loading ||
      state.failure ||
      menuOpen ||
      screenReader
    )
      return;
    // Progress and caption updates must not restart the inactivity timer.
    const timer = setTimeout(() => setIdle(true), 3000);
    return () => clearTimeout(timer);
  }, [
    state.isPlaying,
    state.loading,
    state.failure,
    menuOpen,
    screenReader,
    interaction,
  ]);
  useEffect(() => {
    if (isTV) return;
    const animation = Animated.timing(headerOpacity, {
      toValue: controlsVisible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [controlsVisible, headerOpacity]);
  const { setPlayback } = app;
  // Keep VideoView's PureComponent stable during progress updates. Updating
  // the native view while an AVKit menu is open can interrupt remote focus.
  const fullscreenOptions = useMemo(() => ({ enable: isTV }), []);
  const onFullscreenExit = useCallback(() => {
    if (isTV && entered.current && !pictureInPicture.current) setPlayback(null);
  }, [setPlayback]);
  const onPictureInPictureStart = useCallback(() => {
    pictureInPicture.current = true;
  }, []);
  const onPictureInPictureStop = useCallback(() => {
    pictureInPicture.current = false;
  }, []);
  useEffect(() => {
    if (!isTV || !shown || !attached || state.loading || entered.current)
      return;
    if (state.status !== 'readyToPlay') return;
    entered.current = true;
    void view.current?.enterFullscreen().catch((error) => {
      entered.current = false;
      app.notify(String(error));
    });
  }, [shown, attached, state.loading, state.status]);

  const groups: PlayerMenuGroup[] = [
    {
      title: state.switchingAudio ? 'Changing audio…' : 'Audio language',
      symbol: 'waveform',
      // AVKit already provides native track menus on TV. Add our menu only
      // for server renditions, which AVPlayer cannot discover in the stream.
      options:
        isTV &&
        !state.audioChoices.some((choice) => choice.id.startsWith('server:'))
          ? []
          : state.audioChoices.length
            ? state.audioChoices.map((choice) => ({
                ...choice,
                id: 'audio:' + choice.id,
                disabled: state.loading || state.switchingAudio,
              }))
            : [
                {
                  id: 'audio:default',
                  label: 'Default audio',
                  selected: true,
                  disabled: true,
                },
              ],
    },
    {
      title: 'Subtitles',
      symbol: 'captions.bubble',
      options:
        isTV &&
        !state.subtitleChoices.some((choice) =>
          choice.id.startsWith('external:'),
        )
          ? []
          : state.subtitleChoices.map((choice) => ({
              ...choice,
              id: 'subtitle:' + choice.id,
            })),
    },
    {
      title: 'Playback speed',
      symbol: 'speedometer',
      options: [0.5, 1, 1.25, 1.5, 2].map((rate) => ({
        id: 'speed:' + rate,
        label: rate === 1 ? 'Normal' : rate + '×',
        selected: state.speed === rate,
      })),
    },
    {
      title: 'Source & quality',
      symbol: '4k.tv',
      options:
        isTV && playback.sources.length < 2
          ? []
          : playback.sources.map((source) => ({
              id: 'source:' + source.id,
              label: source.label,
              selected: source.id === playback.source.id,
              disabled: state.loading || state.switchingAudio,
            })),
    },
    {
      title: 'Up next',
      symbol: 'list.bullet',
      options:
        playback.queue.length > 1
          ? playback.queue.map((item, i) => ({
              id: 'queue:' + i,
              label: item.title,
              selected: i === playback.index,
            }))
          : [],
    },
    {
      title: 'Playback',
      symbol: 'ellipsis.circle',
      options: [
        { id: 'pip', label: 'Picture in Picture' },
        { id: 'retry', label: 'Reload source' },
        { id: 'close', label: 'Close player' },
      ],
    },
  ];
  const menuSignature = JSON.stringify(groups);
  const menuGroups = useMemo(() => groups, [menuSignature]);
  function select(id: string) {
    if (id.startsWith('audio:')) void state.selectAudio(id.slice(6));
    if (id.startsWith('subtitle:')) state.selectSubtitle(id.slice(9));
    if (id.startsWith('speed:')) {
      const wasPlaying = state.player.playing;
      state.player.playbackRate = Number(id.slice(6));
      if (!wasPlaying) state.player.pause();
    }
    if (id.startsWith('source:')) {
      const source = playback.sources.find(
        (source) => source.id === id.slice(7),
      );
      if (source) state.selectSource(source);
    }
    if (id.startsWith('queue:')) {
      const item = playback.queue[Number(id.slice(6))];
      if (item) void app.play(item, playback.queue);
    }
    if (id === 'pip')
      void view.current
        ?.startPictureInPicture()
        .catch((error) => app.notify(String(error)));
    if (id === 'retry') state.retry();
    if (id === 'close') app.setPlayback(null);
  }
  const menu = (
    <PlayerMenus
      groups={menuGroups}
      caption={state.caption}
      problem={state.failure}
      onReady={() => setAttached(true)}
      onMenuVisibilityChange={(event) => setMenuOpen(event.nativeEvent.visible)}
      onSelect={(event) => select(event.nativeEvent.id)}
      style={isTV ? s.tvMenu : s.menu}
    />
  );
  const content = (
    <SafeAreaProvider>
      <SafeAreaView
        style={s.root}
        edges={isTV ? [] : ['top', 'left', 'right', 'bottom']}
        onTouchStart={isTV ? undefined : showControls}
      >
        {!isTV && (
          <Animated.View
            style={[s.header, { opacity: headerOpacity }]}
            pointerEvents={controlsVisible ? 'auto' : 'none'}
            accessibilityElementsHidden={!controlsVisible}
          >
            <Button
              variant="secondary"
              icon={X}
              label="Close player"
              onPress={() => app.setPlayback(null)}
              style={s.close}
            />
            <View style={s.heading}>
              <Text style={s.title} numberOfLines={1}>
                {playback.item.title}
              </Text>
              {state.switchingAudio && (
                <Text style={s.subtitle}>Changing audio…</Text>
              )}
            </View>
            <NativeGlass style={s.glassButton}>{menu}</NativeGlass>
          </Animated.View>
        )}
        <View style={s.stage}>
          <VideoView
            ref={view}
            player={state.player}
            style={StyleSheet.absoluteFill}
            nativeControls
            fullscreenOptions={fullscreenOptions}
            onFullscreenExit={onFullscreenExit}
            onPictureInPictureStart={onPictureInPictureStart}
            onPictureInPictureStop={onPictureInPictureStop}
            allowsPictureInPicture
            startsPictureInPictureAutomatically={!isTV}
            contentFit={
              playback.trailer && app.state.settings.cropTrailers
                ? 'cover'
                : 'contain'
            }
          />
          {isTV && menu}
          {!isTV && !!state.caption && (
            <View pointerEvents="none" style={s.captions}>
              <Text style={s.caption}>{state.caption}</Text>
            </View>
          )}
          {state.loading && (
            <View pointerEvents="none" style={s.loading}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}
          {!!state.failure && (
            <View style={s.failure}>
              <Text style={s.error}>{state.failure}</Text>
              <Button onPress={state.retry}>Try again</Button>
              {isTV && (
                <Button onPress={() => app.setPlayback(null)}>
                  Close player
                </Button>
              )}
            </View>
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
  // iOS uses the native navigation controller for fullscreen presentation and
  // status-bar ownership. tvOS still presents AVKit from its React modal.
  if (embedded) return content;
  return (
    <Modal
      visible
      presentationStyle="fullScreen"
      animationType="fade"
      supportedOrientations={['portrait', 'landscape']}
      onShow={() => setShown(true)}
      onRequestClose={() => app.setPlayback(null)}
    >
      {content}
    </Modal>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  stage: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  heading: { flex: 1, alignItems: 'center', gap: 4 },
  title: { color: '#fff', fontSize: 17, fontWeight: '600' },
  subtitle: { color: '#aaa', fontSize: 13 },
  glassButton: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden' },
  close: { width: 48, height: 48, paddingHorizontal: 0 },
  menu: { width: 48, height: 48 },
  tvMenu: { position: 'absolute', width: 1, height: 1, top: 0, left: 0 },
  loading: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captions: {
    position: 'absolute',
    bottom: 100,
    left: 24,
    right: 24,
    alignItems: 'center',
  },
  caption: {
    color: '#fff',
    fontSize: 19,
    lineHeight: 27,
    backgroundColor: '#000c',
    padding: 8,
    borderRadius: 8,
    textAlign: 'center',
  },
  failure: {
    alignSelf: 'center',
    maxWidth: '80%',
    marginTop: 60,
    padding: 24,
    backgroundColor: '#252527f2',
    borderRadius: 20,
    gap: 16,
  },
  error: { color: '#fff', fontSize: isTV ? 24 : 16, textAlign: 'center' },
});
