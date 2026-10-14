import React, { useState } from 'react';
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
import { colors, time, isTV, textSize } from './theme';
import { Pressable, FocusRegion } from './focus';
import { useT } from './i18n';
import { imageSource } from './artwork';

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
    variant === 'primary'
      ? colors.background
      : variant === 'danger'
        ? colors.danger
        : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hasTVPreferredFocus={isTV && preferredFocus}
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        variant === 'primary' && styles.primary,
        variant === 'ghost' && styles.ghost,
        variant === 'danger' && styles.danger,
        (pressed || hover) && { opacity: 0.8 },
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
      style={[styles.chip, selected && styles.selectedChip]}
    >
      <Text style={[styles.chipText, selected && { color: colors.accent }]}>
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
  return (
    <View
      style={[
        styles.inputWrap,
        style,
        isTV && focused && { borderColor: colors.accent, borderWidth: 3 },
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
        onSubmitEditing={onSubmit}
        onFocus={() => setFocused(true)}
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
  return (
    <View style={{ width, gap: 11 }}>
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
            height: width * (landscape ? 0.59 : 1.2),
            borderColor: hover ? colors.accent : colors.border,
          },
        ]}
      >
        {item.poster && !failed ? (
          <Image
            source={imageSource(item.poster)}
            resizeMode="cover"
            style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
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
            { backgroundColor: hover ? '#00000040' : '#00000012' },
          ]}
        />
        {item.type === 'series' && (
          <View style={styles.cardBadge}>
            <Text style={styles.badgeText}>SERIES</Text>
          </View>
        )}
        {hover && (
          <View style={styles.cardPlay}>
            <Play
              size={23}
              fill={colors.background}
              color={colors.background}
            />
          </View>
        )}
        {!isTV && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={(saved ? 'Remove ' : 'Save ') + item.title}
            onPress={(e) => {
              e.stopPropagation();
              toggleSave(item);
            }}
            style={styles.bookmark}
          >
            {saved ? (
              <Check size={16} color={colors.accent} />
            ) : (
              <Bookmark size={16} color={colors.text} />
            )}
          </Pressable>
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
            paddingBottom: 4,
          }}
        >
          {items.map((item) => (
            <Card
              key={item.providerId + ':' + item.id}
              item={item}
              width={isTV ? (landscape ? 380 : 270) : landscape ? 268 : 194}
              landscape={landscape}
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
        <Card key={item.providerId + ':' + item.id} item={item} width={width} />
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
    borderRadius: 9,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  compact: {
    paddingVertical: isTV ? 14 : 9,
    paddingHorizontal: isTV ? 20 : 12,
    borderRadius: 8,
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  danger: { backgroundColor: '#2d1e23', borderColor: '#493039' },
  buttonText: { fontSize: textSize(13), fontWeight: '600' },
  chip: {
    paddingHorizontal: isTV ? 24 : 15,
    paddingVertical: isTV ? 14 : 9,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedChip: { backgroundColor: colors.accentDark, borderColor: '#38564a' },
  chipText: { color: colors.muted, fontSize: textSize(12), fontWeight: '500' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  sectionTitle: {
    color: colors.text,
    fontSize: textSize(19),
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  muted: { color: colors.muted, fontSize: textSize(13) },
  pageHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    alignItems: 'center',
    marginBottom: 28,
  },
  pageTitle: {
    color: colors.text,
    fontSize: textSize(33),
    letterSpacing: -1.1,
    fontWeight: '600',
  },
  eyebrow: {
    color: colors.accent,
    letterSpacing: 2.2,
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
    borderRadius: 18,
    backgroundColor: colors.accentDark,
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
  },
  input: {
    color: colors.text,
    fontSize: textSize(14),
    paddingVertical: 13,
    flex: 1,
    minWidth: 0,
  },
  cardImage: {
    borderRadius: 11,
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
    borderRadius: 4,
    backgroundColor: '#0c1015cc',
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
    backgroundColor: colors.accent,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookmark: {
    position: 'absolute',
    top: 9,
    right: 9,
    backgroundColor: '#0c1015cc',
    borderRadius: 7,
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
