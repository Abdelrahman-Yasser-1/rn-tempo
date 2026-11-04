import {
  BottomSheetBackdrop,
  BottomSheetFooter,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps, BottomSheetFooterProps } from '@gorhom/bottom-sheet';
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
  const { sheetRef, points, footerHeight, onFooterLayout, onDismissPress } = useBottomSheet({
    visible: isVisible,
    snapPoints,
  });

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

  // gorhom pins the footer to the sheet's bottom edge while the content scrolls. It re-mounts when
  // `footer` changes identity, which is cheap for a row of buttons.
  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) =>
      footer === undefined ? null : (
        <BottomSheetFooter {...props}>
          <Box
            testID={testID ? `${testID}.footer` : undefined}
            style={styles.footer}
            onLayout={onFooterLayout}
          >
            {footer}
          </Box>
        </BottomSheetFooter>
      ),
    [footer, testID, onFooterLayout],
  );

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={points}
      enableDynamicSizing={points === undefined}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      footerComponent={footer === undefined ? undefined : renderFooter}
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
        {/* The footer floats over the sheet, so the content reserves its height at the bottom. */}
        <Box style={[styles.content, footerHeight > 0 && { paddingBottom: footerHeight }]}>
          {children}
        </Box>
      </BottomSheetView>
    </BottomSheetModal>
  );
}
