/** Taps on the version label that open the debug menu. */
export const SECRET_TAP_COUNT = 5;
/** Window in which all the taps must happen. */
export const SECRET_TAP_WINDOW_MS = 3000;

/** Languages offered on the Language screen. */
export const LANGUAGE_OPTIONS = ['en', 'ar'] as const;

/** Theme modes offered on the Theme screen. */
export const THEME_OPTIONS = ['system', 'light', 'dark'] as const;

/** Text sizes offered on the Text size screen: the scale (see `FONT_SCALES`) and its string key. */
export const TEXT_SIZE_OPTIONS = [
  { id: 'small', scale: 0.9 },
  { id: 'default', scale: 1 },
  { id: 'large', scale: 1.15 },
  { id: 'extraLarge', scale: 1.3 },
] as const;
