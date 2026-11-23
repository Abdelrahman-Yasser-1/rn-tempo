import { Appearance, type ColorSchemeName } from 'react-native';
import { UnistylesRuntime, useUnistyles } from 'react-native-unistyles';
import { create } from 'zustand';

import {
  appThemes,
  buildTypography,
  DEFAULT_FONT_SCALE,
  parseFontScale,
  themeKey,
  type FontScale,
  type ThemeKey,
} from './themes';
import { PALETTE_NAMES, type PaletteName, type ThemeMode } from './tokens';

/** What the user picked for light/dark: a fixed mode, or follow the device. */
export type ThemeModePreference = ThemeMode | 'system';

/** The brand palette (colours) the user picked; independent from the mode. */
export type ThemePalette = PaletteName;

const MODES: readonly ThemeModePreference[] = ['light', 'dark', 'system'];

const isMode = (candidate: unknown): candidate is ThemeModePreference =>
  MODES.some((mode) => mode === candidate);

const isPalette = (candidate: unknown): candidate is ThemePalette =>
  PALETTE_NAMES.some((name) => name === candidate);

const toThemeMode = (scheme: ColorSchemeName | null): ThemeMode =>
  scheme === 'dark' ? 'dark' : 'light';

let stopFollowingDevice: (() => void) | undefined;

/**
 * Applies mode + palette to Unistyles at runtime; no remount needed, styles update natively.
 *
 * Unistyles' own adaptive themes only switch between the themes named `light` and `dark`, which are
 * the default palette. So `system` + `default` uses them as they are, while `system` + a brand
 * palette turns adaptive themes off and follows the device scheme here (via `Appearance`).
 */
function applyTheme(mode: ThemeModePreference, palette: ThemePalette): void {
  stopFollowingDevice?.();
  stopFollowingDevice = undefined;

  if (mode === 'system' && palette === 'default') {
    UnistylesRuntime.setAdaptiveThemes(true);
    return;
  }
  UnistylesRuntime.setAdaptiveThemes(false);
  if (mode !== 'system') {
    UnistylesRuntime.setTheme(themeKey(palette, mode));
    return;
  }
  UnistylesRuntime.setTheme(themeKey(palette, toThemeMode(Appearance.getColorScheme())));
  const subscription = Appearance.addChangeListener(({ colorScheme }) => {
    UnistylesRuntime.setTheme(themeKey(palette, toThemeMode(colorScheme)));
  });
  stopFollowingDevice = () => {
    subscription.remove();
  };
}

/** Where the choices live; injected because `theme` may not import `services` (lint boundary). */
export type ThemePersistence = {
  loadMode: () => string | undefined;
  loadPalette: () => string | undefined;
  saveMode: (mode: ThemeModePreference) => void;
  savePalette: (palette: ThemePalette) => void;
  loadFontScale: () => string | undefined;
  saveFontScale: (scale: FontScale) => void;
};

let persistence: ThemePersistence | undefined;

/**
 * Wires persistence (MMKV `app.theme` for the mode, `app.palette` for the palette, contract C15);
 * bootstrap calls this before `initTheme`.
 */
export function configureThemePersistence(next: ThemePersistence): void {
  persistence = next;
}

/**
 * Rebuilds the typography of every registered theme for a user font scale. Unistyles' `updateTheme`
 * swaps the theme object natively, so every stylesheet that reads `theme.typography` re-renders.
 */
function applyFontScale(scale: FontScale): void {
  const typography = buildTypography(scale);
  for (const key of Object.keys(appThemes) as ThemeKey[]) {
    UnistylesRuntime.updateTheme(key, (current) => ({ ...current, typography }));
  }
}

// Not persisted through zustand: the source of truth is MMKV (contract C15).
const useChoiceStore = create<{
  mode: ThemeModePreference;
  palette: ThemePalette;
  fontScale: FontScale;
}>(() => ({
  mode: 'system',
  palette: 'default',
  fontScale: DEFAULT_FONT_SCALE,
}));

/**
 * Reads the stored choices and applies them. Call after `initStorage()`, before first render.
 *
 * Migration: before palettes, `app.theme` held `light`, `dark` or `system`, and it still does (it
 * is now the mode), so an old value stays valid as is. A missing `app.palette` means `default`,
 * a missing `app.font-scale` means 1, and any unknown value falls back to `system` / `default` / 1.
 */
export function initTheme(): void {
  const storedMode = persistence?.loadMode();
  const storedPalette = persistence?.loadPalette();
  const mode = isMode(storedMode) ? storedMode : 'system';
  const palette = isPalette(storedPalette) ? storedPalette : 'default';
  const fontScale = parseFontScale(persistence?.loadFontScale()) ?? DEFAULT_FONT_SCALE;
  if (fontScale !== DEFAULT_FONT_SCALE) {
    applyFontScale(fontScale);
  }
  applyTheme(mode, palette);
  useChoiceStore.setState({ mode, palette, fontScale });
}

/** Persists and applies a mode. */
function setMode(mode: ThemeModePreference): void {
  persistence?.saveMode(mode);
  applyTheme(mode, useChoiceStore.getState().palette);
  useChoiceStore.setState({ mode });
}

/** Persists and applies a palette. */
function setPalette(palette: ThemePalette): void {
  persistence?.savePalette(palette);
  applyTheme(useChoiceStore.getState().mode, palette);
  useChoiceStore.setState({ palette });
}

/** Persists and applies a text size without a restart. */
function setFontScale(scale: FontScale): void {
  persistence?.saveFontScale(scale);
  applyFontScale(scale);
  useChoiceStore.setState({ fontScale: scale });
}

/** Current theme object plus the user's mode (light/dark/system) and palette and text size, with their setters. */
export function useAppTheme() {
  const { theme } = useUnistyles();
  const mode = useChoiceStore((state) => state.mode);
  const palette = useChoiceStore((state) => state.palette);
  const fontScale = useChoiceStore((state) => state.fontScale);
  return { theme, mode, palette, fontScale, setMode, setPalette, setFontScale };
}
