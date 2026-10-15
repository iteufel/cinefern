import { createContext } from 'react';
import type { View } from 'react-native';

export const TVFocusMemory = createContext<(view: View | null) => void>(
  () => {},
);
