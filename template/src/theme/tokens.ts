// Design token contract (C6). Shapes are fixed; color values live in themes.ts (WS3 task 3.2).

export type ColorTokens = {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;
  textInverse: string;
  border: string;
  divider: string;
  focus: string;
  success: string;
  onSuccess: string;
  warning: string;
  onWarning: string;
  error: string;
  onError: string;
  info: string;
  onInfo: string;
  overlay: string;
  skeletonBase: string;
  skeletonHighlight: string;
};

export type SpacingKey = 'none' | 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' | 'xxxl';
export const spacing: Record<SpacingKey, number> = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export type RadiusKey = 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
export const radii: Record<RadiusKey, number> = { none: 0, sm: 4, md: 8, lg: 12, xl: 16, full: 9999 };

export type TypographyVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'title'
  | 'body'
  | 'bodyStrong'
  | 'bodySmall'
  | 'label'
  | 'caption'
  | 'button';

export type TypographyStyle = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700';
  letterSpacing: number;
};

export type ShadowKey = 'none' | 'sm' | 'md' | 'lg';
export type ZIndexKey = 'base' | 'dropdown' | 'sticky' | 'modal' | 'toast';

export type AppTheme = {
  name: 'light' | 'dark';
  colors: ColorTokens;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: Record<TypographyVariant, TypographyStyle>;
  // RN 0.76+ supports the CSS-like boxShadow string on both platforms.
  shadows: Record<ShadowKey, { boxShadow: string }>;
  zIndex: Record<ZIndexKey, number>;
};

// Unistyles requires the first breakpoint to be 0.
export const breakpoints = { xs: 0, sm: 360, md: 600, lg: 900, xl: 1200 } as const;
