import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useIsOnline } from '@shared/hooks';

import { Button } from '../Button';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import { Text } from '../Text';

import { styles } from './styles';
import type { ConnectionModalProps } from './types';

const DEFAULT_DELAY_MS = 5000;

/** The modal is not dismissable; it only closes when the connection returns. */
function ignoreClose(): void {
  // Intentionally empty: closing is driven by connectivity, not by the user.
}

/**
 * Blocking "no connection" modal for flows that cannot work offline. It appears once the device
 * has been offline for `delayMs` and closes by itself when the connection returns.
 */
export function ConnectionModal({
  enabled: isEnabled = true,
  delayMs = DEFAULT_DELAY_MS,
  onRetry,
  testID,
}: ConnectionModalProps) {
  const { t } = useTranslation();
  const isOnline = useIsOnline();
  const [hasWaited, setHasWaited] = useState(false);
  const isGuarding = isEnabled && !isOnline;

  useEffect(() => {
    const timer = isGuarding
      ? setTimeout(() => {
          setHasWaited(true);
        }, delayMs)
      : undefined;
    return () => {
      clearTimeout(timer);
      setHasWaited(false);
    };
  }, [isGuarding, delayMs]);

  return (
    <Modal
      visible={isGuarding && hasWaited}
      dismissable={false}
      onClose={ignoreClose}
      testID={testID}
    >
      <View style={styles.content}>
        <Icon name="wifi-off" size={48} color="error" />
        <Text variant="title" align="center" accessibilityRole="header">
          {t('connection.title')}
        </Text>
        <Text color="textSecondary" align="center">
          {t('connection.message')}
        </Text>
        <Button
          testID={testID ? `${testID}.retry` : undefined}
          title={t('connection.retry')}
          leftIcon="refresh"
          onPress={() => {
            void NetInfo.refresh();
            onRetry?.();
          }}
        />
      </View>
    </Modal>
  );
}
