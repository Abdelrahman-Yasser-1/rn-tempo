// Hermes has no crypto.getRandomValues; the storage encryption key needs it, so load this first.
import 'react-native-get-random-values';

// Unistyles must be configured before any StyleSheet.create call runs.
import './src/theme/unistyles';

import { AppRegistry } from 'react-native';

import { name as appName } from './app.json';
import { App } from './src/app/App';

AppRegistry.registerComponent(appName, () => App);
