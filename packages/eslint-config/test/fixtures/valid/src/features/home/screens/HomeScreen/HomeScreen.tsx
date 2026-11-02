import { View } from 'react-native';

import { Label } from '@shared/components';

import { useHomeScreen } from './useHomeScreen';

export function HomeScreen() {
  const vm = useHomeScreen();

  return (
    <View testID="home" accessibilityRole="none">
      <Label text={vm.title} isActive={false} />
    </View>
  );
}
