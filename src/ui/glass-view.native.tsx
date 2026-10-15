import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, View, type ViewProps } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

export function NativeGlass({ style, ...props }: ViewProps) {
  const [reduceTransparency, setReduceTransparency] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (active) setReduceTransparency(value);
    });
    const listener = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setReduceTransparency,
    );
    return () => {
      active = false;
      listener.remove();
    };
  }, []);
  if (reduceTransparency || !isLiquidGlassAvailable())
    return (
      <View {...props} style={[{ backgroundColor: '#242427f2' }, style]} />
    );
  return (
    <GlassView
      {...props}
      colorScheme="dark"
      glassEffectStyle="regular"
      style={style}
    />
  );
}
