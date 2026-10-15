import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Button, Host } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonStyle,
  controlSize,
  disabled,
  labelStyle,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'sf-symbols-typescript';
import type { SystemButtonProps } from './system-button.types';
import { colors, isTV } from './theme';

const symbols: Record<string, SFSymbol> = {
  Play: 'play.fill',
  Pause: 'pause.fill',
  Bookmark: 'plus',
  Check: 'checkmark',
  Info: 'info.circle',
  X: 'xmark',
  Plus: 'plus',
  Download: 'arrow.down.circle',
  ChevronRight: 'chevron.right',
  ChevronLeft: 'chevron.left',
  ArrowRight: 'arrow.right',
  ArrowLeft: 'arrow.left',
  ArrowUp: 'arrow.up',
  ArrowDown: 'arrow.down',
  Search: 'magnifyingglass',
  Trash2: 'trash',
  RefreshCw: 'arrow.clockwise',
  ExternalLink: 'arrow.up.right',
  Settings2: 'slider.horizontal.3',
  FileUp: 'square.and.arrow.up',
  FilePlus2: 'doc.badge.plus',
  Globe: 'globe',
  Link: 'link',
  Heart: 'heart',
  Bell: 'bell',
  BellOff: 'bell.slash',
};
function textContent(children: React.ReactNode): string {
  return React.Children.toArray(children)
    .map((child) =>
      typeof child === 'string' || typeof child === 'number'
        ? String(child)
        : React.isValidElement<{ children?: React.ReactNode }>(child)
          ? textContent(child.props.children)
          : '',
    )
    .join('');
}
export function SystemButton({
  children,
  icon,
  label,
  variant = 'secondary',
  compact,
  disabled: unavailable,
  style,
  onPress,
}: SystemButtonProps) {
  const text = textContent(children);
  const symbol = icon ? symbols[icon.displayName ?? ''] : undefined;
  const glass = Number.parseInt(String(Platform.Version), 10) >= 26;
  const layout = StyleSheet.flatten(style);
  return (
    <Host
      colorScheme="dark"
      matchContents={
        layout?.width && layout?.height
          ? false
          : layout?.flex || layout?.width
            ? { vertical: true }
            : true
      }
      style={style}
    >
      <Button
        label={text || label || 'More'}
        systemImage={symbol}
        role={variant === 'danger' ? 'destructive' : 'default'}
        onPress={onPress}
        modifiers={[
          buttonStyle(
            variant === 'ghost'
              ? 'borderless'
              : glass
                ? variant === 'primary'
                  ? 'glassProminent'
                  : 'glass'
                : variant === 'primary'
                  ? 'borderedProminent'
                  : 'bordered',
          ),
          controlSize(compact ? 'regular' : 'large'),
          // Let tvOS choose its foreground and tint as focus changes. A fixed
          // white tint makes focused glass buttons white on pale gray.
          ...(!isTV ? [tint(colors.accent)] : []),
          disabled(!!unavailable),
          ...(label ? [accessibilityLabel(label)] : []),
          ...(!text && symbol ? [labelStyle('iconOnly')] : []),
        ]}
      />
    </Host>
  );
}
