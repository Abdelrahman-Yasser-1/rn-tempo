import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Label } from '@shared/components';

export function HomeScreen() {
  const { t } = useTranslation();

  return (
    <View testID="home" accessibilityRole="none">
      <Label text={t('home.title')} isActive={false} />
    </View>
  );
}
