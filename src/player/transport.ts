export interface TransportSnapshot {
  position: number;
  playing: boolean;
  rate: number;
}
export interface NativeTransport {
  currentTime: number;
  playing: boolean;
  playbackRate: number;
  play(): void;
  pause(): void;
}
export function captureTransport(player: NativeTransport): TransportSnapshot {
  return {
    position: player.currentTime,
    playing: player.playing,
    rate: player.playbackRate,
  };
}
export function restoreTransport(
  player: NativeTransport,
  snapshot: TransportSnapshot,
) {
  player.currentTime = snapshot.position;
  // AVPlayer's playbackRate setter can start playback. Restore pause state last.
  player.playbackRate = snapshot.rate;
  if (snapshot.playing) player.play();
  else player.pause();
}
