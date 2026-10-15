import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSource, type MediaSource } from '@cinefern/provider-sdk';
import {
  preferredTrack,
  sameTrack,
  trackKey,
  resolveAudioSource,
} from '../src/player/audio';
import { captureTransport, restoreTransport } from '../src/player/transport';

test('Apple tracks without IDs remain individually selectable, including commentary', () => {
  const english = { language: 'en', label: 'English' };
  const german = { language: 'de', label: 'Deutsch' };
  const commentary = { language: 'en', label: 'English commentary' };
  assert.equal(new Set([english, german, commentary].map(trackKey)).size, 3);
  assert.equal(sameTrack(english, german), false);
  assert.equal(sameTrack(null, english), false);
  assert.equal(sameTrack({ ...english }, english), true);
  assert.equal(sameTrack(english, commentary), false);
  assert.notEqual(
    trackKey({ ...english, id: '1' }),
    trackKey({ ...english, id: '2' }),
  );
});

test('audio preferences match Apple locales, ISO-639 aliases and late available tracks', () => {
  const tracks = [
    { language: 'en_GB', label: 'English' },
    { language: 'de-DE', label: 'Deutsch' },
  ];
  assert.equal(preferredTrack([], 'de'), undefined);
  assert.equal(preferredTrack(tracks, 'ger'), tracks[1]);
  assert.equal(preferredTrack(tracks, 'eng'), tracks[0]);
  assert.equal(preferredTrack(tracks, 'off'), undefined);
  assert.equal(preferredTrack(tracks, ''), undefined);
});

test('server audio selection requests a specific track and refuses a wrong-language fallback', async () => {
  const source: MediaSource = {
    id: 'version:hls',
    type: 'hls',
    url: 'https://media.example/english.m3u8',
    label: 'HD',
  };
  const track = { id: 'version:3', label: 'German commentary', language: 'de' };
  const result = await resolveAudioSource(
    async (preferences) => {
      assert.equal(preferences.audioTrackId, track.id);
      assert.equal(preferences.audioLanguage, 'de');
      assert.equal(preferences.quality, 1080);
      return [
        {
          ...source,
          url: 'https://media.example/german.m3u8',
          audioTrackId: track.id,
        },
      ];
    },
    { quality: 1080, audioLanguage: 'en', subtitleLanguage: 'off' },
    source,
    track,
  );
  assert.equal(result.source.audioTrackId, track.id);
  assert.equal(result.source.id, source.id);
  await assert.rejects(
    resolveAudioSource(
      async () => [source],
      { quality: 1080, audioLanguage: 'en', subtitleLanguage: 'off' },
      source,
      track,
    ),
    /unavailable/,
  );
});

test('source replacement restores a paused position after a playbackRate setter starts AVPlayer', () => {
  let playing = false;
  let rate = 1.5;
  const player = {
    currentTime: 123.75,
    get playing() {
      return playing;
    },
    get playbackRate() {
      return rate;
    },
    set playbackRate(value: number) {
      rate = value;
      playing = true;
    },
    play() {
      playing = true;
    },
    pause() {
      playing = false;
    },
  };
  const saved = captureTransport(player);
  player.currentTime = 0;
  player.playbackRate = 1;
  restoreTransport(player, saved);
  assert.equal(player.currentTime, 123.75);
  assert.equal(player.playbackRate, 1.5);
  assert.equal(player.playing, false);
  player.play();
  const active = captureTransport(player);
  player.pause();
  restoreTransport(player, active);
  assert.equal(player.playing, true);
});

test('provider audio metadata rejects duplicate and unknown track identities', () => {
  const source: MediaSource = {
    id: 'hls',
    type: 'hls',
    url: 'https://media.example/a.m3u8',
    label: 'HD',
    audioTracks: [{ id: '1', language: 'en', label: 'English' }],
    audioTrackId: '1',
  };
  assertSource(source);
  assert.throws(
    () => assertSource({ ...source, audioTrackId: '2' }),
    /unknown selected audio/,
  );
  assert.throws(
    () =>
      assertSource({
        ...source,
        audioTracks: [...source.audioTracks!, ...source.audioTracks!],
      }),
    /invalid audio/,
  );
});
