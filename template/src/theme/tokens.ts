// Design token contract (C6). Shapes are fixed; color values are built from `palette`.

import { palette } from './palette';

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
export const radii: Record<RadiusKey, number> = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

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
  /** Raw primitives for component variants only (amendment 49); use `colors` first. */
  palette: typeof palette;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: Record<TypographyVariant, TypographyStyle>;
  // RN 0.76+ supports the CSS-like boxShadow string on both platforms.
  shadows: Record<ShadowKey, { boxShadow: string }>;
  zIndex: Record<ZIndexKey, number>;
};

// Unistyles requires the first breakpoint to be 0.
export const breakpoints = { xs: 0, sm: 360, md: 600, lg: 900, xl: 1200 } as const;

// ---------------------------------------------------------------------------
// Values (WS9b PR B). Shapes above are the C6 contract; do not change them.
// Every value is a `palette` reference (no raw hex). Every `on*` token is the foreground for its
// paired container and is verified >= 4.5:1 by tokens.test.ts.
// ---------------------------------------------------------------------------

export const lightColors: ColorTokens = {
  primary: palette.sa[600],
  onPrimary: palette.white,
  primaryContainer: palette.sa[100],
  onPrimaryContainer: palette.sa[900],
  secondary: palette.lavender[600],
  onSecondary: palette.white,
  background: palette.white,
  onBackground: palette.gray[1000],
  surface: palette.gray[50],
  onSurface: palette.gray[1000],
  surfaceVariant: palette.gray[100],
  onSurfaceVariant: palette.gray[600],
  textPrimary: palette.gray[1000],
  textSecondary: palette.gray[700],
  textDisabled: palette.gray[400], // exempt from AA (disabled state)
  textInverse: palette.white, // text on primary/dark fills
  border: palette.gray[300],
  divider: palette.gray[200],
  focus: palette.sa[700], // keyboard/a11y focus ring
  success: palette.success[700], // AA: white on success600 is only 3.9:1, so one step darker
  onSuccess: palette.white,
  warning: palette.warning[600],
  onWarning: palette.gray[1000],
  error: palette.error[600],
  onError: palette.white,
  info: palette.info[600], // white passes AA at 4.57:1
  onInfo: palette.white,
  overlay: 'rgba(13, 18, 28, 0.5)', // modal scrim
  skeletonBase: palette.gray[200],
  skeletonHighlight: palette.gray[100],
};

export const darkColors: ColorTokens = {
  primary: palette.sa[400],
  onPrimary: palette.sa[950],
  primaryContainer: palette.sa[800],
  onPrimaryContainer: palette.sa[100],
  secondary: palette.lavender[400],
  onSecondary: palette.gray[950],
  background: palette.gray[950],
  onBackground: palette.gray[25],
  surface: palette.gray[900],
  onSurface: palette.gray[25],
  surfaceVariant: palette.gray[800],
  onSurfaceVariant: palette.gray[300],
  textPrimary: palette.gray[25],
  textSecondary: palette.gray[400],
  textDisabled: palette.gray[600],
  textInverse: palette.gray[1000],
  border: palette.gray[700],
  divider: palette.gray[800],
  focus: palette.sa[300],
  success: palette.success[400],
  onSuccess: palette.gray[950],
  warning: palette.warning[400],
  onWarning: palette.gray[950],
  error: palette.error[400],
  onError: palette.gray[950],
  info: palette.info[400],
  onInfo: palette.gray[950],
  overlay: 'rgba(0, 0, 0, 0.6)',
  skeletonBase: palette.gray[800],
  skeletonHighlight: palette.gray[700],
};

/** Raw type scale (design px). `fontSize`/`lineHeight` are run through `fontPx` in themes.ts. */
export const typeScale: Record<
  TypographyVariant,
  { fontSize: number; lineHeight: number; fontWeight: TypographyStyle['fontWeight'] }
> = {
  display: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  h1: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  h3: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  bodySmall: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  button: { fontSize: 16, lineHeight: 20, fontWeight: '600' },
};

/** Elevation as RN 0.76+ `boxShadow` strings, identical on both platforms. */
export const shadows: Record<ShadowKey, { boxShadow: string }> = {
  none: { boxShadow: '0 0 0 0 rgba(0, 0, 0, 0)' },
  sm: { boxShadow: '0 1px 2px 0 rgba(15, 23, 42, 0.08)' },
  md: { boxShadow: '0 4px 8px 0 rgba(15, 23, 42, 0.12)' },
  lg: { boxShadow: '0 12px 24px 0 rgba(15, 23, 42, 0.16)' },
};

export const zIndex: Record<ZIndexKey, number> = {
  base: 0,
  dropdown: 100,
  sticky: 200,
  modal: 300,
  toast: 400,
};
