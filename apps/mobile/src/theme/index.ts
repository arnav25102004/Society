import { DefaultTheme as NavTheme } from '@react-navigation/native';

export const Colors = {
  primary: '#1A73E8',
  primaryDark: '#1557B0',
  primaryLight: '#E8F0FE',
  secondary: '#34A853',
  secondaryLight: '#E6F4EA',
  error: '#EA4335',
  errorLight: '#FCE8E6',
  warning: '#FBBC04',
  warningLight: '#FEF7E0',
  background: '#F8F9FA',
  surface: '#FFFFFF',
  surfaceVariant: '#F1F3F4',
  textPrimary: '#1C1B1F',
  textSecondary: '#49454F',
  textDisabled: '#9AA0A6',
  border: '#E0E0E0',
  divider: '#F0F0F0',
  overlay: 'rgba(0,0,0,0.5)',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const FontSizes = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  display: 32,
} as const;

// React Navigation theme
export const navTheme = {
  ...NavTheme,
  colors: {
    ...NavTheme.colors,
    background: Colors.background,
    card: Colors.surface,
    text: Colors.textPrimary,
    border: Colors.border,
    primary: Colors.primary,
  },
};
