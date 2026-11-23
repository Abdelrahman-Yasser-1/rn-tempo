import { STORAGE_KEYS } from '@services/storage/keys';
import { storage } from '@services/storage/storage';
import { configureThemePersistence, initTheme as applyStoredTheme } from '@theme/index';

/** Bootstrap step 1b: wire the theme mode, palette and text size to MMKV `app.theme` / `app.palette` / `app.font-scale` and apply them. Needs storage. */
export function initTheme(): void {
  configureThemePersistence({
    loadMode: () => storage.getString(STORAGE_KEYS.theme),
    loadPalette: () => storage.getString(STORAGE_KEYS.palette),
    saveMode: (mode) => {
      storage.setString(STORAGE_KEYS.theme, mode);
    },
    savePalette: (palette) => {
      storage.setString(STORAGE_KEYS.palette, palette);
    },
    loadFontScale: () => storage.getString(STORAGE_KEYS.fontScale),
    saveFontScale: (scale) => {
      storage.setString(STORAGE_KEYS.fontScale, String(scale));
    },
  });
  applyStoredTheme();
}
