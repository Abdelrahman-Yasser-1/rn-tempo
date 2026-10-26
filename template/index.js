// Hermes has no crypto.getRandomValues; the storage encryption key needs it, so load this first.
import 'react-native-get-random-values';

// Unistyles must be configured before any StyleSheet.create call runs.
import './src/theme/unistyles';

import { AppRegistry } from 'react-native';

import { name as appName } from './app.json';
import { App } from './src/app/App';

// @tempo-feature:storybook:start
// WS4 (task 4.x): when `ENV.STORYBOOK_ENABLED` is set outside prod, register the Storybook root
// here instead of `App`.
// @tempo-feature:storybook:end

AppRegistry.registerComponent(appName, () => App);
