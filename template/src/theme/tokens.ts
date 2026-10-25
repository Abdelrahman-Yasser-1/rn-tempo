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
// Values (WS3 task 3.2). Shapes above are the C6 contract; do not change them.
// Every `on*` token is the foreground for its paired container and is verified >= 4.5:1
// by tokens.test.ts. Palette anchors come from the plan; the rest are derived by analogy.
// ---------------------------------------------------------------------------

export const lightColors: ColorTokens = {
  primary: '#2563EB',
  onPrimary: '#FFFFFF',
  primaryContainer: '#DBEAFE', // blue-100: tinted fill for selected/primary-tonal surfaces
  onPrimaryContainer: '#1E3A8A', // blue-900
  secondary: '#0F766E', // teal-700: accent distinct from primary, white text passes AA
  onSecondary: '#FFFFFF',
  background: '#FFFFFF',
  onBackground: '#0F172A',
  surface: '#F8FAFC',
  onSurface: '#0F172A',
  surfaceVariant: '#F1F5F9', // slate-100: inputs, chips, grouped rows
  onSurfaceVariant: '#475569',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textDisabled: '#94A3B8', // exempt from AA (disabled state)
  textInverse: '#FFFFFF', // text on primary/dark fills
  border: '#E2E8F0',
  divider: '#E2E8F0',
  focus: '#1D4ED8', // blue-700: keyboard/a11y focus ring
  success: '#16A34A',
  onSuccess: '#052E16', // white on #16A34A is only 3.3:1, so dark text is used
  warning: '#D97706',
  onWarning: '#1C1917', // white on #D97706 is only 3.2:1
  error: '#DC2626',
  onError: '#FFFFFF',
  info: '#0284C7',
  onInfo: '#020617', // white on #0284C7 is only 4.1:1, and #082F49 only 3.4:1
  overlay: 'rgba(15, 23, 42, 0.5)', // modal scrim
  skeletonBase: '#E2E8F0',
  skeletonHighlight: '#F1F5F9',
};

export const darkColors: ColorTokens = {
  primary: '#60A5FA',
  onPrimary: '#0B1220',
  primaryContainer: '#1E3A8A',
  onPrimaryContainer: '#DBEAFE',
  secondary: '#5EEAD4', // teal-300
  onSecondary: '#042F2E',
  background: '#0B1220',
  onBackground: '#F1F5F9',
  surface: '#111827',
  onSurface: '#F1F5F9',
  surfaceVariant: '#1F2937',
  onSurfaceVariant: '#CBD5E1',
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textDisabled: '#64748B',
  textInverse: '#0F172A',
  border: '#1F2937',
  divider: '#273449', // one step lighter than border so rows stay separable on surface
  focus: '#93C5FD',
  success: '#4ADE80',
  onSuccess: '#052E16',
  warning: '#FBBF24',
  onWarning: '#1C1917',
  error: '#F87171',
  onError: '#450A0A',
  info: '#38BDF8',
  onInfo: '#082F49',
  overlay: 'rgba(0, 0, 0, 0.6)',
  skeletonBase: '#1F2937',
  skeletonHighlight: '#374151',
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
