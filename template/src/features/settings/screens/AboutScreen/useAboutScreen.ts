import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { isProd } from '@config/env';
import { useSecretTap } from '@features/settings/hooks/useSecretTap';
import { navigationRef } from '@navigation/navigationRef';
import type { SettingsStackParamList } from '@navigation/types';

const openDebugMenu = () => {
  if (!isProd && navigationRef.isReady()) {
    navigationRef.navigate('DebugMenu');
  }
};

/** Logic of the about screen: back navigation and the secret-tap debug menu entry. */
export function useAboutScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList, 'About'>>();
  const onVersionPress = useSecretTap(openDebugMenu);

  return { onVersionPress, onBack: navigation.goBack };
}
