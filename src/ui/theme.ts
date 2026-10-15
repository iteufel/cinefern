import { Platform, type ViewStyle } from 'react-native';

export const isTV = Platform.isTV;
export const isIOS = Platform.OS === 'ios' && !isTV;
// TV uses larger type at the same logical resolution for comfortable couch viewing.
export const textSize = (size: number) =>
  isTV ? Math.max(18, size * 1.5) : size;

const sharedColors = {
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
export const colors = isTV
  ? {
      ...sharedColors,
      background: '#080809',
      sidebar: '#1c1c1e',
      surface: '#1c1c1e',
      raised: '#303033',
      accent: '#ffffff',
      accentDark: '#ffffff18',
      muted: '#b2b2b8',
      glass: '#222225e8',
      border: '#ffffff15',
    }
  : isIOS
    ? {
        ...sharedColors,
        background: '#000000',
        sidebar: '#1c1c1e',
        surface: '#1c1c1e',
        raised: '#2c2c2e',
        border: '#38383a',
        text: '#ffffff',
        muted: '#98989f',
        subtle: '#8e8e93',
        accent: '#0a84ff',
        accentDark: '#0a84ff24',
        warning: '#ffd60a',
        danger: '#ff453a',
        glass: '#1c1c1ef2',
        separator: '#38383a',
      }
    : sharedColors;
export const font = {
  regular: 'System',
  mono: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
};

// Desktop CSS material. Native navigation surfaces use NativeGlass / UIKit.
type GlassStyle = ViewStyle & { backdropFilter?: string };
export const glass: GlassStyle = {
  backgroundColor: colors.glass,
  ...(Platform.OS === 'web'
    ? { backdropFilter: 'blur(28px) saturate(150%)' }
    : {}),
};
export const radius = {
  control: isIOS ? 10 : 14,
  card: isIOS || isTV ? 12 : 22,
  hero: isIOS ? 20 : 28,
  pill: 999,
};
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
