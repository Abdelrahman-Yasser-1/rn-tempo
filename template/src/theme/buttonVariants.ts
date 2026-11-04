// Button and IconButton variant colours (WS9b PR D), shared by both components. Semantic tokens
// first; `theme.palette` only where no semantic token exists (pressed fills, subtle danger fills).

import type { AppTheme, ColorTokens } from './tokens';

export type ButtonVariant =
  | 'primary'
  | 'neutral'
  | 'secondary'
  | 'outline'
  | 'outlineOnColor'
  | 'subtle'
  | 'ghost'
  | 'danger'
  | 'dangerOutline'
  | 'dangerSubtle'
  | 'dangerGhost'
  | 'link';

export const BUTTON_VARIANTS: readonly ButtonVariant[] = [
  'primary',
  'neutral',
  'secondary',
  'outline',
  'outlineOnColor',
  'subtle',
  'ghost',
  'danger',
  'dangerOutline',
  'dangerSubtle',
  'dangerGhost',
  'link',
];

/** Foreground (label, icon, spinner) token for each variant. */
export const BUTTON_CONTENT_COLOR: Record<ButtonVariant, keyof ColorTokens> = {
  primary: 'onPrimary',
  neutral: 'textInverse',
  secondary: 'textPrimary',
  outline: 'textPrimary',
  outlineOnColor: 'onPrimary',
  subtle: 'textPrimary',
  ghost: 'primary',
  danger: 'onError',
  dangerOutline: 'error',
  dangerSubtle: 'error',
  dangerGhost: 'error',
  link: 'primary',
};

export type ButtonVariantColors = {
  background: string;
  pressedBackground: string;
  border: string;
  disabledBackground: string;
  disabledBorder: string;
};

const CLEAR = 'transparent';

/** Fill, border and pressed/disabled fills for each variant in the given theme. */
export function getButtonVariantColors(
  theme: AppTheme,
): Record<ButtonVariant, ButtonVariantColors> {
  const { colors, palette } = theme;
  const isDark = theme.name === 'dark';
  const pressedPrimary = isDark ? palette.sa[300] : palette.sa[700];
  const pressedError = isDark ? palette.error[300] : palette.error[700];
  const dangerTint = isDark ? palette.error[800] : palette.error[50];
  const dangerPressedTint = isDark ? palette.error[700] : palette.error[100];

  const solid = (background: string, pressedBackground: string): ButtonVariantColors => ({
    background,
    pressedBackground,
    border: CLEAR,
    disabledBackground: colors.surfaceVariant,
    disabledBorder: CLEAR,
  });
  const bare = (pressedBackground: string, border: string = CLEAR): ButtonVariantColors => ({
    background: CLEAR,
    pressedBackground,
    border,
    disabledBackground: CLEAR,
    disabledBorder: border === CLEAR ? CLEAR : colors.border,
  });

  return {
    primary: solid(colors.primary, pressedPrimary),
    neutral: solid(colors.textPrimary, colors.textSecondary),
    secondary: solid(colors.surfaceVariant, colors.border),
    outline: bare(colors.surfaceVariant, colors.border),
    outlineOnColor: bare(pressedPrimary, colors.onPrimary),
    subtle: bare(colors.surfaceVariant),
    ghost: bare(colors.primaryContainer),
    danger: solid(colors.error, pressedError),
    dangerOutline: bare(dangerPressedTint, colors.error),
    dangerSubtle: solid(dangerTint, dangerPressedTint),
    dangerGhost: bare(dangerTint),
    link: bare(CLEAR),
  };
}
