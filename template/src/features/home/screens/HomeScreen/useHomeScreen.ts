// @tempo-feature:samples:start
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
// @tempo-feature:samples:end
import { useTranslation } from 'react-i18next';

import { useCurrentUser, useMeQuery } from '@features/auth';
// @tempo-feature:samples:start
import type { HomeStackParamList } from '@navigation/types';
// @tempo-feature:samples:end
import { useRefreshOnFocus } from '@shared/hooks';

/** Logic of the home screen: greeting from the freshest user, refresh on focus and navigation. */
export function useHomeScreen() {
  // @tempo-feature:samples:start
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList, 'Home'>>();
  // @tempo-feature:samples:end
  const { t } = useTranslation('home');
  const { data, refetch } = useMeQuery();
  const user = useCurrentUser();
  useRefreshOnFocus(refetch);

  const firstName = data?.firstName ?? user?.firstName;
  const greeting =
    firstName === undefined ? t('greetingFallback') : t('greeting', { name: firstName });

  // @tempo-feature:samples:start
  const onBrowseItems = () => {
    navigation.navigate('ItemsList');
  };
  // @tempo-feature:samples:end

  return {
    greeting,
    // @tempo-feature:samples:start
    onBrowseItems,
    // @tempo-feature:samples:end
  };
}
