import React, { useContext, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  AlertCircle,
  ArrowRight,
  Bookmark,
  Check,
  Film,
  Play,
  Search,
  type LucideIcon,
} from 'lucide-react-native';
import type { MediaItem } from '@cinefern/provider-sdk';
import { useApp } from '../app-context';
import { colors, radius, time, isTV, isIOS, textSize } from './theme';
import { ScreenLayoutContext } from './screen-layout';
import { Pressable, FocusRegion } from './focus';
import { useT } from './i18n';
import { imageSource } from './artwork';
import { TVFocusMemory } from './focus-memory';

export function Button({
  children,
  onPress,
  icon: Icon,
  variant = 'secondary',
  disabled,
  compact,
  style,
  label,
  preferredFocus,
}: {
  children?: React.ReactNode;
  onPress?: () => void;
  icon?: LucideIcon;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  label?: string;
  preferredFocus?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const foreground =
    isTV && hover && !disabled && variant !== 'danger'
      ? '#111111'
      : variant === 'primary'
        ? isIOS
          ? '#ffffff'
          : colors.background
        : variant === 'danger'
          ? colors.danger
          : variant === 'ghost' && isIOS
            ? colors.accent
            : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hasTVPreferredFocus={isTV && preferredFocus}
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      onFocus={() => {
        if (isTV) setHover(true);
      }}
      onBlur={() => {
        if (isTV) setHover(false);
      }}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        variant === 'primary' && styles.primary,
        variant === 'ghost' && styles.ghost,
        variant === 'danger' && styles.danger,
        hover && !disabled && { opacity: 0.88 },
        isTV &&
          hover &&
          !disabled &&
          variant !== 'danger' && { backgroundColor: '#fff', opacity: 1 },
        pressed && !disabled && { opacity: 0.75 },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      {Icon && (
        <Icon
          size={isTV ? 25 : compact ? 17 : 18}
          color={foreground}
          strokeWidth={1.8}
        />
      )}
      {children && (
        <Text style={[styles.buttonText, { color: foreground }]}>
          {children}
        </Text>
      )}
    </Pressable>
  );
}
export function Chip({
  children,
  selected,
  onPress,
}: {
  children: React.ReactNode;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.selectedChip,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.chipText, selected && { color: colors.text }]}>
        {children}
      </Text>
    </Pressable>
  );
}
export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle && <Text style={styles.muted}>{subtitle}</Text>}
      </View>
      {action}
    </View>
  );
}
export function PageHeader({
  title,
  eyebrow,
  description,
  action,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  const compact = useWindowDimensions().width < 650;
  const { nativeHeader } = useContext(ScreenLayoutContext);
  if (nativeHeader) {
    if (!description && !action) return null;
    return (
      <View style={{ gap: 16, marginBottom: 24 }}>
        {description && (
          <Text style={[styles.muted, { lineHeight: 22 }]}>{description}</Text>
        )}
        {action}
      </View>
    );
  }
  return (
    <View
      style={[
        styles.pageHeader,
        compact && { flexDirection: 'column', alignItems: 'flex-start' },
      ]}
    >
      <View style={{ flex: compact ? undefined : 1, gap: 9 }}>
        {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <Text style={styles.pageTitle}>{title}</Text>
        {description && (
          <Text
            style={[styles.muted, { maxWidth: 600, lineHeight: textSize(22) }]}
          >
            {description}
          </Text>
        )}
      </View>
      {action}
    </View>
  );
}
export function Loading() {
  const t = useT();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.muted}>{t.loading}</Text>
    </View>
  );
}
export function Empty({
  title,
  description,
  icon: Icon = Film,
  action,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon color={colors.accent} size={28} strokeWidth={1.4} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text
        style={[
          styles.muted,
          { maxWidth: 390, textAlign: 'center', lineHeight: textSize(23) },
        ]}
      >
        {description}
      </Text>
      {action}
    </View>
  );
}
export function Failure({
  error,
  retry,
}: {
  error: string;
  retry?: () => void;
}) {
  const t = useT();
  return (
    <Empty
      icon={AlertCircle}
      title="Something didn’t load"
      description={error}
      action={retry && <Button onPress={retry}>{t.retry}</Button>}
    />
  );
}
export function Input({
  value,
  onChange,
  placeholder,
  secret,
  icon: Icon,
  onSubmit,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secret?: boolean;
  icon?: LucideIcon;
  onSubmit?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [focused, setFocused] = useState(false);
  const remember = useContext(TVFocusMemory);
  return (
    <View
      style={[
        styles.inputWrap,
        style,
        focused && { borderColor: colors.accent },
        isTV && focused && { borderWidth: 3 },
      ]}
    >
      {Icon && <Icon size={18} color={colors.muted} />}
      <TextInput
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.subtle}
        secureTextEntry={secret}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode={isIOS && !secret ? 'while-editing' : 'never'}
        returnKeyType={onSubmit ? 'search' : 'done'}
        onSubmitEditing={onSubmit}
        onFocus={() => {
          setFocused(true);
          if (isTV) remember(null);
        }}
        onBlur={() => setFocused(false)}
        style={styles.input}
        selectionColor={colors.accent}
      />
    </View>
  );
}
export function Card({
  item,
  width = 210,
  progress,
  landscape,
}: {
  item: MediaItem;
  width?: number;
  progress?: number;
  landscape?: boolean;
}) {
  const { navigate, library, toggleSave } = useApp();
  const [hover, setHover] = useState(false);
  const [failed, setFailed] = useState(false);
  const saved = library.isSaved(item);
  const artwork = landscape ? item.backdrop || item.poster : item.poster;
  return (
    <View style={{ width, gap: 11 }}>
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.title}
          onHoverIn={() => setHover(true)}
          onHoverOut={() => setHover(false)}
          onFocus={() => setHover(true)}
          onBlur={() => setHover(false)}
          onLongPress={isTV ? () => toggleSave(item) : undefined}
          accessibilityHint={
            isTV
              ? 'Select for details. Hold Select to save or remove from your watchlist.'
              : undefined
          }
          onPress={() =>
            navigate(
              item.type === 'collection'
                ? {
                    name: 'collection',
                    providerId: item.providerId,
                    id: item.id,
                    title: item.title,
                  }
                : item.type === 'person'
                  ? {
                      name: 'person',
                      providerId: item.providerId,
                      id: item.id,
                      title: item.title,
                    }
                  : { name: 'item', item },
            )
          }
          style={[
            styles.cardImage,
            {
              height: width * (landscape ? 0.59 : 1.4),
              borderColor: hover ? colors.accent : colors.border,
            },
          ]}
        >
          {artwork && !failed ? (
            <Image
              source={imageSource(artwork)}
              resizeMode="cover"
              style={[
                StyleSheet.absoluteFill,
                { width: '100%', height: '100%' },
              ]}
              onError={() => setFailed(true)}
            />
          ) : (
            <View style={[styles.center, { flex: 1 }]}>
              <Film color={colors.subtle} size={40} />
              <Text style={styles.muted}>{item.title}</Text>
            </View>
          )}
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: isTV
                  ? 'transparent'
                  : hover
                    ? '#00000040'
                    : '#00000012',
              },
            ]}
          />
          {item.type === 'series' && (
            <View style={styles.cardBadge}>
              <Text style={styles.badgeText}>SERIES</Text>
            </View>
          )}
          {hover && !isTV && (
            <View style={styles.cardPlay}>
              <Play
                size={23}
                fill={colors.background}
                color={colors.background}
              />
            </View>
          )}
          {progress !== undefined && (
            <View style={styles.progressTrack}>
              <View
                style={{
                  height: 3,
                  backgroundColor: colors.accent,
                  width: `${Math.min(100, Math.max(0, progress * 100))}%`,
                }}
              />
            </View>
          )}
        </Pressable>
        {!isTV && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={(saved ? 'Remove ' : 'Save ') + item.title}
            accessibilityState={{ selected: saved }}
            onPress={() => toggleSave(item)}
            style={styles.bookmark}
          >
            {saved ? (
              <Check size={16} color={colors.accent} />
            ) : (
              <Bookmark size={16} color={colors.text} />
            )}
          </Pressable>
        )}
      </View>
      <View style={{ gap: 5 }}>
        <Text numberOfLines={1} style={styles.cardTitle}>
          {item.title}
        </Text>
        <Text numberOfLines={1} style={styles.cardMeta}>
          {[
            item.year,
            item.genres?.[0],
            item.duration ? Math.round(item.duration / 60) + ' min' : undefined,
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </Text>
      </View>
    </View>
  );
}
export function MediaRow({
  items,
  title,
  subtitle,
  action,
  landscape,
  progress,
}: {
  items: MediaItem[];
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  landscape?: boolean;
  progress?: (item: MediaItem) => number | undefined;
}) {
  if (!items.length) return null;
  return (
    <View style={{ gap: 19, marginBottom: 32 }}>
      <SectionHeader title={title} subtitle={subtitle} action={action} />
      <FocusRegion>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            gap: isTV ? 28 : 18,
            padding: isTV ? 8 : 0,
            paddingBottom: 8,
          }}
        >
          {items.map((item) => (
            <Card
              key={item.providerId + ':' + item.id}
              item={item}
              width={isTV ? 360 : landscape ? 268 : isIOS ? 154 : 194}
              landscape={isTV || landscape}
              progress={progress?.(item)}
            />
          ))}
        </ScrollView>
      </FocusRegion>
    </View>
  );
}
export function MediaGrid({
  items,
  availableWidth = 900,
}: {
  items: MediaItem[];
  availableWidth?: number;
}) {
  const columns = Math.max(2, Math.floor(availableWidth / (isTV ? 300 : 200)));
  const width = (availableWidth - (columns - 1) * 18) / columns;
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18, rowGap: 28 }}
    >
      {items.map((item) => (
        <Card
          key={item.providerId + ':' + item.id}
          item={item}
          width={width}
          landscape={isTV}
        />
      ))}
    </View>
  );
}
export const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: isTV ? 26 : 19,
    paddingVertical: isTV ? 18 : 13,
    minHeight: 46,
    borderRadius: isIOS ? 12 : radius.pill,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  compact: {
    paddingVertical: isTV ? 14 : 9,
    paddingHorizontal: isTV ? 20 : 12,
    minHeight: isTV ? 54 : isIOS ? 44 : 40,
    minWidth: isIOS ? 44 : 40,
    borderRadius: radius.pill,
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  danger: { backgroundColor: '#2d1e23', borderColor: '#493039' },
  buttonText: {
    fontSize: textSize(isIOS ? 17 : 14),
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  chip: {
    paddingHorizontal: isTV ? 24 : 18,
    paddingVertical: isTV ? 14 : 9,
    minHeight: isIOS ? 44 : 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
  },
  selectedChip: { backgroundColor: colors.raised, borderColor: '#ffffff20' },
  chipText: {
    color: colors.muted,
    fontSize: textSize(isIOS ? 15 : 13),
    fontWeight: '600',
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  sectionTitle: {
    color: colors.text,
    fontSize: textSize(23),
    fontWeight: '700',
    letterSpacing: -0.7,
  },
  muted: { color: colors.muted, fontSize: textSize(isIOS ? 15 : 13) },
  pageHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  pageTitle: {
    color: colors.text,
    fontSize: textSize(38),
    letterSpacing: -1.3,
    fontWeight: '700',
  },
  eyebrow: {
    color: colors.muted,
    letterSpacing: 1.1,
    fontSize: textSize(10),
    fontWeight: '600',
  },
  center: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  empty: {
    paddingVertical: 65,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 16,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 5,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: textSize(23),
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  inputWrap: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.raised,
    paddingHorizontal: 14,
  },
  input: {
    color: colors.text,
    fontSize: textSize(isIOS ? 17 : 14),
    paddingVertical: 12,
    minHeight: 44,
    flex: 1,
    minWidth: 0,
  },
  cardImage: {
    borderRadius: isIOS ? 10 : 16,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBadge: {
    position: 'absolute',
    left: 10,
    top: 10,
    borderRadius: 6,
    backgroundColor: '#101012b3',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  badgeText: {
    color: colors.text,
    fontSize: textSize(8),
    fontWeight: '700',
    letterSpacing: 1,
  },
  cardPlay: {
    width: 48,
    height: 48,
    backgroundColor: colors.text,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookmark: {
    position: 'absolute',
    top: 9,
    right: 9,
    backgroundColor: '#101012b3',
    borderRadius: radius.pill,
    minWidth: isIOS ? 44 : 36,
    minHeight: isIOS ? 44 : 36,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#ffffff22',
  },
  cardTitle: {
    color: colors.text,
    fontSize: textSize(14),
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  cardMeta: { color: colors.muted, fontSize: textSize(11) },
});
