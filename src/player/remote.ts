export type RemoteAction =
  'toggle' | 'backward' | 'forward' | 'show' | undefined;

export function remotePlaybackAction(
  event: { eventType: string; eventKeyAction?: number },
  controlsVisible: boolean,
  dialogOpen: boolean,
): RemoteAction {
  // The Siri Remote reports both press and release. Act only once.
  if (event.eventKeyAction === 1 || dialogOpen) return;
  if (event.eventType === 'playPause') return 'toggle';
  // Visible buttons own directional navigation; never seek while moving focus.
  if (controlsVisible) return;
  if (['left', 'longLeft'].includes(event.eventType)) return 'backward';
  if (['right', 'longRight'].includes(event.eventType)) return 'forward';
  if (['up', 'down'].includes(event.eventType)) return 'show';
}
