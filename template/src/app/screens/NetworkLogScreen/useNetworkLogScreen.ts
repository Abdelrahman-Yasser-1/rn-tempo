import { useNavigation } from '@react-navigation/native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getBackHandler, type Theme } from 'react-native-network-logger';
import { useUnistyles } from 'react-native-unistyles';

/** Logic of the network log screen: the viewer theme from our tokens and the back action. */
export function useNetworkLogScreen() {
  const { t } = useTranslation('app');
  const navigation = useNavigation();
  const { theme } = useUnistyles();
  const { colors } = theme;

  const viewerTheme = useMemo<Theme>(
    () => ({
      colors: {
        background: colors.background,
        link: colors.primary,
        card: colors.surface,
        text: colors.textPrimary,
        statusGood: colors.success,
        statusWarning: colors.warning,
        statusBad: colors.error,
        secondary: colors.secondary,
        onSecondary: colors.onSecondary,
        muted: colors.textSecondary,
      },
    }),
    [colors],
  );

  // The viewer keeps its own details view: back steps out of a request first, then leaves.
  const onBack = useMemo(
    () =>
      getBackHandler(() => {
        navigation.goBack();
      }),
    [navigation],
  );

  return { title: t('debug.networkLog.title'), viewerTheme, onBack };
}
