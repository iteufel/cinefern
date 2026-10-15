import type {
  MediaSource,
  PlaybackPreferences,
  SourceAudioTrack,
} from '@cinefern/provider-sdk';

// AVFoundation uses locale identifiers and has no Android-style track ID.
export interface NativeTrack {
  id?: string;
  language: string;
  label: string;
  name?: string;
}
export function trackKey(track: NativeTrack): string {
  return track.id != null
    ? JSON.stringify(['id', track.id])
    : JSON.stringify([
        'metadata',
        track.language,
        track.label,
        track.name ?? '',
      ]);
}
export function sameTrack(
  a: NativeTrack | null | undefined,
  b: NativeTrack,
): boolean {
  return !!a && trackKey(a) === trackKey(b);
}
export function languageCode(value: string): string {
  const code = value.toLowerCase().replace('_', '-').split('-')[0] ?? '';
  const aliases: Record<string, string> = {
    eng: 'en',
    deu: 'de',
    ger: 'de',
    fra: 'fr',
    fre: 'fr',
    spa: 'es',
    ita: 'it',
    por: 'pt',
    jpn: 'ja',
    kor: 'ko',
    zho: 'zh',
    chi: 'zh',
    rus: 'ru',
    ara: 'ar',
    nld: 'nl',
    dut: 'nl',
    und: '',
  };
  return aliases[code] ?? code;
}
export function preferredTrack<T extends NativeTrack>(
  tracks: T[],
  language: string,
): T | undefined {
  if (!languageCode(language) || language === 'off') return undefined;
  return (
    tracks.find(
      (track) => track.language.toLowerCase() === language.toLowerCase(),
    ) ??
    tracks.find(
      (track) => languageCode(track.language) === languageCode(language),
    )
  );
}

export function sourceForAudio(
  sources: MediaSource[],
  current: MediaSource,
  track: SourceAudioTrack,
): MediaSource {
  // Never silently fall back to the wrong language when a server denies transcoding.
  const matching = sources.filter((source) => source.audioTrackId === track.id);
  const source =
    matching.find((source) => source.id === current.id) ??
    matching.find((source) => source.type === current.type) ??
    matching[0];
  if (!source)
    throw new Error(
      'This audio track is unavailable. Check playback permissions on your server.',
    );
  return source;
}

export async function resolveAudioSource(
  getSources: (preferences: PlaybackPreferences) => Promise<MediaSource[]>,
  preferences: PlaybackPreferences,
  current: MediaSource,
  track: SourceAudioTrack,
) {
  const sources = await getSources({
    ...preferences,
    audioLanguage: track.language,
    audioTrackId: track.id,
  });
  return { sources, source: sourceForAudio(sources, current, track) };
}
