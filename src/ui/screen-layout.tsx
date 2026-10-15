import { createContext } from 'react';

export const ScreenLayoutContext = createContext({
  nativeHeader: false,
  contentWidth: 0,
});
