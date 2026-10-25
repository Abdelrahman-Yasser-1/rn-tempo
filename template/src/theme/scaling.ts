import { UnistylesRuntime } from 'react-native-unistyles';

// Ported from ejada. Base design is 390x844; scaling is capped so large screens (tablets)
// do not blow layouts up, and fonts get a tighter cap to avoid uncomfortably large text.
export const BASE_WIDTH = 390;
export const BASE_HEIGHT = 844;
export const MAX_SCALE = 1.2;
export const FONT_MAX_SCALE = 1.15;

export type ScreenSize = { width: number; height: number };

const clampMax = (value: number, max: number): number => Math.min(value, max);

/** Builds the scaling helpers for a screen size; non-positive sizes (not measured yet) scale by 1. */
export function createScaling({ width, height }: Readonly<ScreenSize>) {
  const widthScale = width > 0 ? clampMax(width / BASE_WIDTH, MAX_SCALE) : 1;
  const heightScale = height > 0 ? clampMax(height / BASE_HEIGHT, MAX_SCALE) : 1;
  const fontScale = width > 0 ? clampMax(width / BASE_WIDTH, FONT_MAX_SCALE) : 1;

  const px = (size: number): number => Math.round(size * widthScale);
  return {
    px,
    pxH: (size: number): number => Math.round(size * heightScale),
    /** Blends `size` and `px(size)` by `factor` (0-1) for values that should scale less than `px`. */
    pxM: (size: number, factor = 0.5): number => Math.round(size + (px(size) - size) * factor),
    fontPx: (size: number): number => Math.round(size * fontScale),
  };
}

// Measured once at startup, like ejada: layouts stay stable across rotation and split-screen.
const scaling = createScaling(UnistylesRuntime.screen);

/** Scales a horizontal size/spacing from the 390pt design width (clamped at 1.2x). */
export const px = scaling.px;
/** Scales a vertical size from the 844pt design height (clamped at 1.2x). */
export const pxH = scaling.pxH;
/** Moderate scale: partway between the raw value and `px(size)`. */
export const pxM = scaling.pxM;
/** Scales a font size from the design width (clamped at 1.15x). */
export const fontPx = scaling.fontPx;
