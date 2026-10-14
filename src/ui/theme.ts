import { Platform, type ViewStyle } from 'react-native';

export const isTV = Platform.isTV;
// TV uses larger type at the same logical resolution for comfortable couch viewing.
export const textSize = (size: number) =>
  isTV ? Math.max(18, size * 1.5) : size;

export const colors = {
  background: '#101012',
  sidebar: '#18181b',
  surface: '#1c1c1f',
  raised: '#2c2c30',
  border: '#ffffff12',
  text: '#f5f5f7',
  muted: '#a1a1aa',
  subtle: '#8e8e98',
  accent: '#ade8c9',
  accentDark: '#203a2d',
  warning: '#f1c77b',
  danger: '#ff9c9c',
  glass: '#242427e8',
  selection: '#ffffff12',
  separator: '#ffffff0a',
};
export const font = {
  regular: 'System',
  mono: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
};

// CSS glass on desktop; a legible translucent material on native platforms.
// Keeping this web-only avoids adding a native blur dependency to tvOS.
type GlassStyle = ViewStyle & { backdropFilter?: string };
export const glass: GlassStyle = {
  backgroundColor: colors.glass,
  ...(Platform.OS === 'web'
    ? { backdropFilter: 'blur(28px) saturate(150%)' }
    : {}),
};
export const radius = { control: 14, card: 22, hero: 28, pill: 999 };
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
