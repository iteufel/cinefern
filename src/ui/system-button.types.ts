import type React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
export interface SystemButtonProps {
  children?: React.ReactNode;
  onPress?: () => void;
  icon?: LucideIcon;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  label?: string;
  preferredFocus?: boolean;
}
