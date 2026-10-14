import React, { forwardRef, useState, useEffect, useRef } from 'react';
import {
  Pressable as NativePressable,
  TVFocusGuideView,
  TVEventControl,
  Text,
  View,
  type PressableProps,
  type SwitchProps,
  type ViewProps,
} from 'react-native';
import { colors } from './theme';

const backHandlers = new Set<symbol>();
export function useTVBackHandling(active: boolean) {
  const token = useRef(Symbol('tv-back-handler')).current;
  useEffect(() => {
    const update = () => {
      if (backHandlers.size) TVEventControl.enableTVMenuKey();
      else TVEventControl.disableTVMenuKey();
    };
    if (active) backHandlers.add(token);
    update();
    return () => {
      backHandlers.delete(token);
      update();
    };
  }, [active, token]);
}

export const Pressable = forwardRef<View, PressableProps>(function Pressable(
  { style, onFocus, onBlur, disabled, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <NativePressable
      {...props}
      ref={ref}
      disabled={disabled}
      focusable={!disabled && props.focusable !== false}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        // Keep the border width stable so focus never moves the surrounding layout.
        { borderWidth: 3 },
        focused &&
          !disabled && {
            borderColor: colors.accent,
            transform: [{ scale: 1.025 }],
          },
      ]}
    />
  );
});

export function FocusRegion(props: ViewProps) {
  return <TVFocusGuideView autoFocus {...props} />;
}

// UISwitch isn't available on tvOS. The remote selects this focusable toggle.
export function Toggle({
  value,
  onValueChange,
  accessibilityLabel,
  disabled,
}: SwitchProps) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: !!value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onValueChange?.(!value)}
      style={{
        minWidth: 100,
        minHeight: 54,
        padding: 12,
        borderRadius: 12,
        alignItems: 'center',
        backgroundColor: value ? colors.accentDark : colors.surface,
        borderColor: value ? '#38564a' : colors.border,
      }}
    >
      <Text
        style={{ fontSize: 22, color: value ? colors.accent : colors.muted }}
      >
        {value ? 'On' : 'Off'}
      </Text>
    </Pressable>
  );
}
