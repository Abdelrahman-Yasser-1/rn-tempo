import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { Box } from '../Box';
import { IconButton } from '../IconButton';
import { Text } from '../Text';

import { styles } from './styles';
import type { BottomSheetProps } from './types';
import { useBottomSheet } from './useBottomSheet';

/**
 * Themed bottom sheet (gorhom modal). Needs `BottomSheetModalProvider`, which `AppProviders`
 * mounts. Drive it with `visible`; `onClose` fires on every dismissal so state stays in sync.
 * The optional `title` renders a header with a close button, and `footer` stays pinned under
 * the content (e.g. confirm and cancel buttons).
 */
export function BottomSheet({
  visible: isVisible,
  onClose,
  title,
  footer,
  snapPoints,
  children,
  testID,
}: BottomSheetProps) {
  const { t } = useTranslation();
  const { sheetRef, points, onDismissPress } = useBottomSheet({ visible: isVisible, snapPoints });

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        accessibilityLabel={t('sheet.close')}
      />
    ),
    [t],
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={points}
      enableDynamicSizing={points === undefined}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      onDismiss={onClose}
    >
      <BottomSheetView testID={testID}>
        {title !== undefined && (
          <Box style={styles.header}>
            <Text variant="title" accessibilityRole="header">
              {title}
            </Text>
            <IconButton
              testID={testID ? `${testID}.close` : undefined}
              icon="close"
              size="sm"
              accessibilityLabel={t('sheet.close')}
              onPress={onDismissPress}
            />
          </Box>
        )}
        <Box style={styles.content}>{children}</Box>
        {footer !== undefined && (
          <Box testID={testID ? `${testID}.footer` : undefined} style={styles.footer}>
            {footer}
          </Box>
        )}
      </BottomSheetView>
    </BottomSheetModal>
  );
}
