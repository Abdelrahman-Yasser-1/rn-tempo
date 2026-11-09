import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@shared/components/Button';
import { Icon } from '@shared/components/Icon';
import { Modal } from '@shared/components/Modal';
import { Text } from '@shared/components/Text';

import { styles } from './styles';
import type { ConnectionModalProps } from './types';
import { useConnectionModal } from './useConnectionModal';

/** The modal is not dismissable; it only closes when the connection returns. */
function ignoreClose(): void {
  // Intentionally empty: closing is driven by connectivity, not by the user.
}

/**
 * Blocking "no connection" modal for flows that cannot work offline. It appears once the device
 * has been offline for `delayMs` and closes by itself when the connection returns.
 */
export function ConnectionModal({ testID, ...props }: ConnectionModalProps) {
  const { t } = useTranslation();
  const { isVisible, onRetryPress } = useConnectionModal(props);

  return (
    <Modal visible={isVisible} dismissable={false} onClose={ignoreClose} testID={testID}>
      <View style={styles.content}>
        <Icon name="wifi-off" size={48} color="error" />
        <Text variant="title" align="center" accessibilityRole="header">
          {t(($) => $.connection.title)}
        </Text>
        <Text color="textSecondary" align="center">
          {t(($) => $.connection.message)}
        </Text>
        <Button
          testID={testID ? `${testID}.retry` : undefined}
          title={t(($) => $.connection.retry)}
          icon="refresh"
          onPress={onRetryPress}
        />
      </View>
    </Modal>
  );
}
