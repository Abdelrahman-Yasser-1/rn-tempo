import { STORAGE_KEYS } from '@services/storage/keys';
import { storage } from '@services/storage/storage';
import { configureThemePersistence, initTheme as applyStoredTheme } from '@theme/index';

/** Bootstrap step 1b: wire the theme preference to MMKV `app.theme` and apply it. Needs storage. */
export function initTheme(): void {
  configureThemePersistence({
    load: () => storage.getString(STORAGE_KEYS.theme),
    save: (preference) => {
      storage.setString(STORAGE_KEYS.theme, preference);
    },
  });
  applyStoredTheme();
}
