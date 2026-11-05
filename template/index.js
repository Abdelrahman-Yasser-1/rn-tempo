// Hermes has no crypto.getRandomValues; the storage encryption key needs it, so load this first.
import 'react-native-get-random-values';

// Unistyles must be configured before any StyleSheet.create call runs.
import './src/theme/unistyles';

import { AppRegistry, LogBox } from 'react-native';

import { name as appName } from './app.json';
import { App } from './src/app/App';
import { startNetworkLogger } from './src/app/bootstrap/startNetworkLogger';

// @gorhom/bottom-sheet 5.2.14 (the latest release) passes dependency arrays to Reanimated hooks,
// which Reanimated 4 ignores on native and warns about each time a sheet opens. Nothing in our code
// can fix it; remove this line once gorhom drops the arrays.
LogBox.ignoreLogs(['[Reanimated] Dependencies should only be used on the web']);

// Non-prod only; patches XHR, so it runs before the first request.
startNetworkLogger();

AppRegistry.registerComponent(appName, () => App);
