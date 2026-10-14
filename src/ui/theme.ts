import { Platform } from 'react-native';

export const isTV = Platform.isTV;
// TV uses larger type at the same logical resolution for comfortable couch viewing.
export const textSize = (size: number) =>
  isTV ? Math.max(18, size * 1.5) : size;

export const colors = {
  background: '#0c1015',
  sidebar: '#10151b',
  surface: '#151c24',
  raised: '#1c2530',
  border: '#26303b',
  text: '#eef0f3',
  muted: '#8895a5',
  subtle: '#566373',
  accent: '#a4e3c6',
  accentDark: '#122e26',
  warning: '#e7bc78',
  danger: '#f09b9b',
};
export const font = { regular: 'System', mono: 'monospace' };
export function time(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00';
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  return (
    (hours ? hours + ':' : '') +
    (hours
      ? String(Math.floor(value / 60) % 60).padStart(2, '0')
      : Math.floor(value / 60)) +
    ':' +
    String(value % 60).padStart(2, '0')
  );
}
export function bytes(value: number): string {
  if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(1) + ' GB';
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + ' MB';
  return Math.round(value / 1000) + ' KB';
}
