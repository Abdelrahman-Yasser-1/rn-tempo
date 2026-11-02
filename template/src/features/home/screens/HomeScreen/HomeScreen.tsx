import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useCurrentUser, useMeQuery } from '@features/auth';
import type { HomeStackParamList } from '@navigation/types';
import { Card, Header, OfflineBanner, Screen, Text } from '@shared/components';
import { useRefreshOnFocus } from '@shared/hooks';

import { styles } from './styles';

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList, 'Home'>>();
  const { t } = useTranslation('home');
  const { data, refetch } = useMeQuery();
  const user = useCurrentUser();
  useRefreshOnFocus(refetch);

  const firstName = data?.firstName ?? user?.firstName;
  const greeting =
    firstName === undefined ? t('greetingFallback') : t('greeting', { name: firstName });

  return (
    <Screen preset="scroll" contentContainerStyle={styles.content} testID="home-screen">
      <Header title={t('title')} testID="home.header" />
      <OfflineBanner testID="home.offline-banner" />
      <View style={styles.body}>
        <Text variant="h1" accessibilityRole="header" testID="home.greeting">
          {greeting}
        </Text>
        {/* @tempo-feature:samples:start */}
        <Card
          variant="outlined"
          accessibilityRole="button"
          accessibilityLabel={t('browseItems')}
          onPress={() => {
            navigation.navigate('ItemsList');
          }}
          testID="home.browse-items"
        >
          <Text variant="title">{t('browseItems')}</Text>
          <Text color="textSecondary">{t('browseItemsHint')}</Text>
        </Card>
        {/* @tempo-feature:samples:end */}
      </View>
    </Screen>
  );
}
