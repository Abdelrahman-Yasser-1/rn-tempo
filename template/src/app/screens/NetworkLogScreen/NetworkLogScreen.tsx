import { View } from 'react-native';
import NetworkLogger from 'react-native-network-logger';

import { Header, Screen } from '@shared/components';

import { styles } from './styles';
import { useNetworkLogScreen } from './useNetworkLogScreen';

/** Non-prod only. The request viewer of react-native-network-logger, themed with our tokens. */
export function NetworkLogScreen() {
  const vm = useNetworkLogScreen();

  return (
    <Screen testID="network-log-screen">
      <Header title={vm.title} onBack={vm.onBack} testID="network-log.header" />
      <View style={styles.viewer}>
        <NetworkLogger theme={vm.viewerTheme} compact />
      </View>
    </Screen>
  );
}
