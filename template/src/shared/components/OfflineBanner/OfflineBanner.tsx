import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useIsOnline } from '@shared/hooks';

import { Icon } from '../Icon';
import { Text } from '../Text';

import { styles } from './styles';
import type { OfflineBannerProps } from './types';

/** Slim banner shown while the device is offline (reads the network store); renders nothing online. */
export function OfflineBanner({ message, testID }: OfflineBannerProps) {
  const { t } = useTranslation();
  const isOnline = useIsOnline();

  if (isOnline) {
    return null;
  }

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID={testID}
      style={styles.root}
    >
      <Icon name="wifi-off" size={16} color="onError" />
      <Text testID={testID ? `${testID}.message` : undefined} variant="label" color="onError">
        {message ?? t('offline.banner')}
      </Text>
    </View>
  );
}
