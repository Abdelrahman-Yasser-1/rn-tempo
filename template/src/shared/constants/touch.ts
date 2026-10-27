import type { Insets } from 'react-native';

/** Minimum touch target in points (WCAG / platform guidelines). */
export const MIN_TOUCH_TARGET = 44;

/** Extends small controls so their hit area reaches the minimum touch target. */
export const HIT_SLOP: Insets = { top: 8, bottom: 8, left: 8, right: 8 };

/** Vertical-only slop for chips, whose visible height is below the minimum touch target. */
export const CHIP_HIT_SLOP: Insets = { top: 8, bottom: 8, left: 4, right: 4 };
