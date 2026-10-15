import React, {
  forwardRef,
  useState,
  useEffect,
  useRef,
  useContext,
} from 'react';
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
import { TVFocusMemory } from './focus-memory';

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
  const node = useRef<View | null>(null);
  const remember = useContext(TVFocusMemory);
  return (
    <NativePressable
      {...props}
      ref={(view) => {
        node.current = view;
        if (typeof ref === 'function') ref(view);
        else if (ref) ref.current = view;
      }}
      disabled={disabled}
      focusable={!disabled && props.focusable !== false}
      tvParallaxProperties={{
        enabled: true,
        magnification: 1.055,
        pressMagnification: 1,
        ...props.tvParallaxProperties,
      }}
      onFocus={(event) => {
        setFocused(true);
        remember(node.current);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        // Keep the border width stable so focus never moves the surrounding layout.
        { borderWidth: 3, borderColor: 'transparent' },
        focused &&
          !disabled && {
            borderColor: '#ffffff',
            shadowColor: '#ffffff',
            shadowOpacity: 0.2,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 4 },
          },
      ]}
    />
  );
});

export function FocusRegion(props: ViewProps) {
  return <TVFocusGuideView autoFocus trapFocusRight {...props} />;
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
