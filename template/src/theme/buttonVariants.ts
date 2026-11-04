// Button and IconButton variant colours (WS9b PR D), shared by both components. Semantic tokens
// first; `theme.palette` only where no semantic token exists (pressed fills, subtle danger fills).

import type { AppTheme } from './tokens';

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

/**
 * Foreground (label, icon, spinner) colour for each variant in the given theme. Most variants use
 * a semantic token; the tinted and danger-on-tint ones use a palette step so the pair stays at
 * WCAG AA (4.5:1) on both the resting and the pressed fill (checked in `buttonVariants.test.ts`).
 */
export function getButtonContentColor(theme: AppTheme, variant: ButtonVariant): string {
  const { colors, palette } = theme;
  const isDark = theme.name === 'dark';
  // `error` / `primary` on their own tints fall below 4.5:1, so step along the palette instead.
  const onErrorTint = isDark ? palette.error[300] : palette.error[700];
  switch (variant) {
    case 'primary':
    case 'outlineOnColor':
      return colors.onPrimary;
    case 'neutral':
      return colors.textInverse;
    case 'secondary':
    case 'outline':
    case 'subtle':
      return colors.textPrimary;
    // Light: `primary` on the pressed `primaryContainer` is 4.2:1, so use the darker sa700.
    case 'ghost':
      return isDark ? colors.primary : palette.sa[700];
    case 'danger':
      return colors.onError;
    case 'dangerOutline':
    case 'dangerSubtle':
    case 'dangerGhost':
      return onErrorTint;
    case 'link':
      return colors.primary;
  }
}

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
  // Dark tints use error900/950 so error300 text keeps 4.5:1 (error800 gave 4.46:1 at best).
  const dangerTint = isDark ? palette.error[900] : palette.error[50];
  const dangerPressedTint = isDark ? palette.error[950] : palette.error[100];
  // Dark ghost pressed fill: sa900 keeps `primary` text at 4.8:1 where sa800 gave 3.8:1.
  const ghostPressed = isDark ? palette.sa[900] : colors.primaryContainer;

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
    ghost: bare(ghostPressed),
    danger: solid(colors.error, pressedError),
    dangerOutline: bare(dangerPressedTint, colors.error),
    dangerSubtle: solid(dangerTint, dangerPressedTint),
    dangerGhost: bare(dangerTint),
    link: bare(CLEAR),
  };
}
