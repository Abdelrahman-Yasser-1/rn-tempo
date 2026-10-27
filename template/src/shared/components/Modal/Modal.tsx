import { useTranslation } from 'react-i18next';
import { Modal as RNModal, Pressable, View } from 'react-native';

import { Text } from '../Text';

import { styles } from './styles';
import type { ModalProps } from './types';

/** Centered panel over a dimmed backdrop. Content is trapped for screen readers while open. */
export function Modal({
  visible: isVisible,
  onClose,
  title,
  dismissable: isDismissable = true,
  children,
  testID,
}: ModalProps) {
  const { t } = useTranslation();
  const handleClose = isDismissable ? onClose : undefined;

  return (
    <RNModal
      transparent
      animationType="fade"
      visible={isVisible}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={handleClose}
      testID={testID}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('modal.close')}
          accessibilityState={{ disabled: !isDismissable }}
          disabled={!isDismissable}
          testID={testID ? `${testID}.backdrop` : undefined}
          style={styles.backdrop}
          onPress={handleClose}
        />
        <View
          accessibilityViewIsModal
          accessibilityLabel={title}
          testID={testID ? `${testID}.panel` : undefined}
          style={styles.panel}
        >
          {title !== undefined && (
            <Text variant="title" accessibilityRole="header">
              {title}
            </Text>
          )}
          {children}
        </View>
      </View>
    </RNModal>
  );
}
