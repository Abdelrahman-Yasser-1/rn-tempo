// Entry point when Metro runs with STORYBOOK_ENABLED=true: withStorybook swaps index.js for this
// file, so it repeats the app entry's early imports and registers under the same app name.
import 'react-native-get-random-values';

import '@theme/unistyles';

import { useEffect, useState } from 'react';
import { AppRegistry } from 'react-native';

import { hideSplash } from '@app/bootstrap/splash';
import { initI18nInstance } from '@services/i18n/i18n';
import { getInitialLanguage } from '@services/i18n/languageManager';
import { initStorage } from '@services/storage/storage';

import { name as appName } from '../app.json';

import { view } from './storybook.requires';

// Selection is not persisted: no AsyncStorage dependency (the template uses MMKV only).
const StorybookUIRoot = view.getStorybookUI({});

/** Components read storage and translations, so both are ready before any story renders. */
function StorybookApp() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    void (async () => {
      await initStorage();
      await initI18nInstance(getInitialLanguage());
      setIsReady(true);
    })()
      // The app's bootstrap normally hides the native splash; this entry replaces it.
      .finally(() => void hideSplash());
  }, []);

  return isReady ? <StorybookUIRoot /> : null;
}

AppRegistry.registerComponent(appName, () => StorybookApp);
