import React, { useRef } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VideoView } from 'expo-video';
import {
  Maximize,
  PictureInPicture2,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  X,
} from 'lucide-react-native';
import { useApp } from '../app-context';
import { Button, Chip, Loading, styles as ui } from '../ui/components';
import { colors } from '../ui/theme';
import { useNativePlayback } from './use-native-playback';

export function Player() {
  const { playback } = useApp();
  return playback ? (
    <NativePlayback
      key={JSON.stringify([
        playback.item.providerId,
        playback.item.id,
        !!playback.trailer,
      ])}
    />
  ) : null;
}
function NativePlayback() {
  const app = useApp();
  const playback = app.playback!;
  const state = useNativePlayback();
  const view = useRef<VideoView>(null);
  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={() => app.setPlayback(null)}
    >
      <SafeAreaView style={s.root}>
        <View style={s.header}>
          <Text style={s.title}>{playback.item.title}</Text>
          <Button
            icon={X}
            label="Close player"
            onPress={() => app.setPlayback(null)}
          />
        </View>
        <View style={s.video}>
          <VideoView
            ref={view}
            player={state.player}
            style={StyleSheet.absoluteFill}
            nativeControls
            fullscreenOptions={{ enable: true }}
            allowsPictureInPicture
            contentFit="contain"
          />
          {!!state.caption && (
            <View pointerEvents="none" style={s.captions}>
              <Text style={s.caption}>{state.caption}</Text>
            </View>
          )}
          {state.loading && (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Loading />
            </View>
          )}
        </View>
        <ScrollView contentContainerStyle={s.options}>
          <View style={[s.choices, { justifyContent: 'center' }]}>
            <Button
              icon={SkipBack}
              disabled={playback.index === 0}
              label="Previous title"
              onPress={() => void app.next(-1)}
            />
            <Button
              icon={RotateCcw}
              label="Back 10 seconds"
              onPress={() => state.player.seekBy(-10)}
            />
            <Button
              icon={RotateCw}
              label="Forward 10 seconds"
              onPress={() => state.player.seekBy(10)}
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
          </View>
          {!!state.failure && (
            <>
              <Text style={{ color: colors.danger }}>{state.failure}</Text>
              <Button onPress={state.retry}>Reload source</Button>
            </>
          )}
          <Text style={ui.eyebrow}>
            {state.switchingAudio ? 'CHANGING AUDIO…' : 'AUDIO LANGUAGE'}
          </Text>
          <View style={s.choices}>
            {state.audioChoices.map((choice) => (
              <Chip
                key={choice.id}
                selected={choice.selected}
                onPress={() => void state.selectAudio(choice.id)}
              >
                {choice.label}
              </Chip>
            ))}
          </View>
          <Text style={ui.eyebrow}>SUBTITLES</Text>
          <View style={s.choices}>
            {state.subtitleChoices.map((choice) => (
              <Chip
                key={choice.id}
                selected={choice.selected}
                onPress={() => state.selectSubtitle(choice.id)}
              >
                {choice.label}
              </Chip>
            ))}
          </View>
          <Text style={ui.eyebrow}>SOURCE & QUALITY</Text>
          <View style={s.choices}>
            {playback.sources.map((source) => (
              <Chip
                key={source.id}
                selected={source.id === playback.source.id}
                onPress={() => state.selectSource(source)}
              >
                {source.label}
              </Chip>
            ))}
          </View>
          <View style={s.choices}>
            {[0.5, 1, 1.5, 2].map((rate) => (
              <Chip
                key={rate}
                selected={state.speed === rate}
                onPress={() => {
                  const playing = state.player.playing;
                  state.player.playbackRate = rate;
                  if (!playing) state.player.pause();
                }}
              >
                {rate}×
              </Chip>
            ))}
          </View>
          {playback.queue.length > 1 && (
            <>
              <Text style={ui.eyebrow}>UP NEXT</Text>
              {playback.queue.map((item, i) => (
                <Button
                  key={JSON.stringify([item.providerId, item.id])}
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
  title: { flex: 1, color: colors.text, fontSize: 19, fontWeight: '600' },
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  options: { padding: 20, gap: 20 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  captions: {
    position: 'absolute',
    bottom: 45,
    left: 15,
    right: 15,
    alignItems: 'center',
  },
  caption: {
    color: '#fff',
    fontSize: 17,
    backgroundColor: '#000b',
    padding: 7,
    textAlign: 'center',
  },
});
