/* eslint-disable no-restricted-imports -- WS4 (task 4.x): replace Text/View with shared components */
import { useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { styles } from './styles';

/**
 * Stand-in for a screen owned by a later workstream; shows the route name.
 * WS9 (task 9.x): replace each registration with the real feature screen, then delete this file.
 */
export function PlaceholderScreen() {
  const { name } = useRoute();
  const { t } = useTranslation('app');

  return (
    <View style={styles.container} testID="placeholder-screen">
      <Text style={styles.title} testID="placeholder-screen.title">
        {name}
      </Text>
      <Text style={styles.subtitle}>{t('placeholder.subtitle')}</Text>
    </View>
  );
}
