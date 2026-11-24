import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { HomeStackParamList } from '@navigation/types';

/** Logic of the Home entry: opens the What's new screen. */
export function useWhatsNewEntry() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList, 'Home'>>();

  const onPress = () => {
    navigation.navigate('WhatsNew');
  };

  return { onPress };
}
