import React from 'react';
import { View, type ViewProps } from 'react-native';
export function NativeGlass(props: ViewProps) {
  return (
    <View {...props} style={[{ backgroundColor: '#242427f2' }, props.style]} />
  );
}
