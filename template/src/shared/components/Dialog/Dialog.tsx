import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '../Button';
import { Modal } from '../Modal';
import { Text } from '../Text';

import { styles } from './styles';
import type { DialogProps } from './types';

/** Confirm/cancel prompt, e.g. before a destructive action or the RTL restart. */
export function Dialog({
  visible: isVisible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive: isDestructive = false,
  loading: isLoading = false,
  onConfirm,
  onCancel,
  testID,
}: DialogProps) {
  const { t } = useTranslation();

  return (
    <Modal
      visible={isVisible}
      title={title}
      dismissable={!isLoading}
      onClose={onCancel}
      testID={testID}
    >
      {message !== undefined && (
        <Text testID={testID ? `${testID}.message` : undefined} color="textSecondary">
          {message}
        </Text>
      )}
      <View style={styles.actions}>
        <Button
          testID={testID ? `${testID}.cancel` : undefined}
          title={cancelLabel ?? t('dialog.cancel')}
          variant="ghost"
          disabled={isLoading}
          onPress={onCancel}
        />
        <Button
          testID={testID ? `${testID}.confirm` : undefined}
          title={confirmLabel ?? t('dialog.confirm')}
          variant={isDestructive ? 'danger' : 'primary'}
          loading={isLoading}
          onPress={onConfirm}
        />
      </View>
    </Modal>
  );
}
