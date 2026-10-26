// Unistyles must be configured before any StyleSheet.create call runs.
import './src/theme/unistyles';

import { AppRegistry } from 'react-native';

import { ENV } from '@config/env';

import { name as appName } from './app.json';
import { App } from './src/app/App';

// Dev mock mode: serve the shared MSW handlers in-app. The require sits inside the `__DEV__`
// guard so Metro strips the whole mock stack (and its polyfills) from release bundles.
if (__DEV__ && ENV.API_MOCKING) {
  require('./src/test-utils/msw/nativeServer').startNativeMocking();
}

// @tempo-feature:storybook:start
// WS4 (task 4.x): when `ENV.STORYBOOK_ENABLED` is set outside prod, register the Storybook root
// here instead of `App`.
// @tempo-feature:storybook:end

AppRegistry.registerComponent(appName, () => App);
