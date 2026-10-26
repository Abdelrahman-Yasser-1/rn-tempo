import type { Insets } from 'react-native';

/** Minimum touch target in points (WCAG / platform guidelines). */
export const MIN_TOUCH_TARGET = 44;

/** Extends small controls so their hit area reaches the minimum touch target. */
export const HIT_SLOP: Insets = { top: 8, bottom: 8, left: 8, right: 8 };
