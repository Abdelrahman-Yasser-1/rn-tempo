// Tinted status surfaces for banners and pills (WS9b PR E). No semantic token covers a pale
// status background, so these step along `theme.palette`; the pairs are checked in
// `statusTints.test.ts` (text on tint at AA 4.5:1, icon on tint at 3:1).

import type { AppTheme } from './tokens';

export type StatusTone = 'success' | 'warning' | 'error' | 'info';

export type StatusTint = {
  background: string;
  border: string;
  /** Status icon colour (a graphic, so 3:1 is enough). */
  icon: string;
  /** Text colour for the title and description on `background`. */
  text: string;
};

/** Background, border, icon and text colours of a status tone in the given theme. */
export function getStatusTint(theme: AppTheme, tone: StatusTone): StatusTint {
  const { palette, colors } = theme;
  const scale = palette[tone];
  if (theme.name === 'dark') {
    return {
      background: scale[800],
      border: scale[600],
      icon: scale[300],
      text: colors.textPrimary,
    };
  }
  return {
    background: scale[50],
    border: scale[300],
    icon: scale[700],
    text: colors.textPrimary,
  };
}
