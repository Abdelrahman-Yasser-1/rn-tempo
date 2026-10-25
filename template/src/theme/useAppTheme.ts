import { UnistylesRuntime, useUnistyles } from 'react-native-unistyles';
import { create } from 'zustand';

export type ThemePreference = 'light' | 'dark' | 'system';

const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

const isThemePreference = (candidate: unknown): candidate is ThemePreference =>
  PREFERENCES.some((preference) => preference === candidate);

/** Applies a preference to Unistyles at runtime; no remount needed, styles update natively. */
function applyPreference(preference: ThemePreference): void {
  if (preference === 'system') {
    UnistylesRuntime.setAdaptiveThemes(true);
    return;
  }
  UnistylesRuntime.setAdaptiveThemes(false);
  UnistylesRuntime.setTheme(preference);
}

/** Where the preference lives; injected because `theme` may not import `services` (lint boundary). */
export type ThemePersistence = {
  load: () => string | undefined;
  save: (preference: ThemePreference) => void;
};

let persistence: ThemePersistence | undefined;

/** Wires persistence (MMKV `app.theme`, contract C15); bootstrap calls this before `initTheme`. */
export function configureThemePersistence(next: ThemePersistence): void {
  persistence = next;
}

// Not persisted through zustand: the source of truth is MMKV `app.theme` (contract C15).
const usePreferenceStore = create<{ preference: ThemePreference }>(() => ({
  preference: 'system',
}));

/** Reads the stored preference and applies it. Call after `initStorage()`, before first render. */
export function initTheme(): void {
  const stored = persistence?.load();
  const preference = isThemePreference(stored) ? stored : 'system';
  applyPreference(preference);
  usePreferenceStore.setState({ preference });
}

/** Persists and applies a preference. */
function setPreference(preference: ThemePreference): void {
  persistence?.save(preference);
  applyPreference(preference);
  usePreferenceStore.setState({ preference });
}

/** Current theme object plus the user's light/dark/system preference and its setter. */
export function useAppTheme() {
  const { theme } = useUnistyles();
  const preference = usePreferenceStore((state) => state.preference);
  return { theme, preference, setPreference };
}
