import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Card, Header, OfflineBanner, Screen, Text } from '@shared/components';

import { styles } from './styles';
import { useHomeScreen } from './useHomeScreen';

export function HomeScreen() {
  const { t } = useTranslation('home');
  const vm = useHomeScreen();

  return (
    <Screen preset="scroll" contentContainerStyle={styles.content} testID="home-screen">
      <Header title={t(($) => $.title)} testID="home.header" />
      <OfflineBanner testID="home.offline-banner" />
      <View style={styles.body}>
        <Text variant="h1" accessibilityRole="header" testID="home.greeting">
          {vm.greeting}
        </Text>
        {/* @tempo-feature:samples:start */}
        <Card
          variant="outlined"
          accessibilityRole="button"
          accessibilityLabel={t(($) => $.browseItems)}
          onPress={vm.onBrowseItems}
          testID="home.browse-items"
        >
          <Text variant="title">{t(($) => $.browseItems)}</Text>
          <Text color="textSecondary">{t(($) => $.browseItemsHint)}</Text>
        </Card>
        {/* @tempo-feature:samples:end */}
      </View>
    </Screen>
  );
}
