import { requireNativeView } from 'expo';
import type { ViewProps } from 'react-native';

export interface PlayerMenuGroup {
  title: string;
  symbol: string;
  options: Array<{
    id: string;
    label: string;
    selected?: boolean;
    disabled?: boolean;
  }>;
}
export interface PlayerMenusProps extends ViewProps {
  groups: PlayerMenuGroup[];
  caption?: string;
  problem?: string;
  onReady?: () => void;
  onMenuVisibilityChange?: (event: {
    nativeEvent: { visible: boolean };
  }) => void;
  onSelect: (event: { nativeEvent: { id: string } }) => void;
}
// iPhone uses a UIKit pop-up menu. tvOS installs these same menus directly
// into AVPlayerViewController's transport bar, including in fullscreen.
export const PlayerMenus = requireNativeView<PlayerMenusProps>(
  'CinefernPlayerMenus',
);
