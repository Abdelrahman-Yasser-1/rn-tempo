import {
  BottomSheetBackdrop,
  BottomSheetFooter,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps, BottomSheetFooterProps } from '@gorhom/bottom-sheet';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { Box } from '@shared/components/Box';
import { Button } from '@shared/components/Button';
import { IconButton } from '@shared/components/IconButton';
import { Text } from '@shared/components/Text';

import { styles } from './styles';
import type { PickerSheetProps } from './types';
import { usePickerSheet } from './usePickerSheet';

/**
 * Bottom sheet shell of the date, time and month pickers: a title with a close button, the picker
 * as children and, when `onConfirm` is given, a Cancel / Confirm footer. Needs
 * `BottomSheetModalProvider`, which `AppProviders` mounts. Drive it with `visible`.
 */
export function PickerSheet({
  visible: isVisible,
  onClose,
  title,
  onConfirm,
  confirmDisabled: isConfirmDisabled = false,
  snapPoints,
  scrollable: isScrollable = false,
  children,
  testID,
}: PickerSheetProps) {
  const { t } = useTranslation();
  const { sheetRef, points, onDismissPress, onConfirmPress } = usePickerSheet({
    visible: isVisible,
    onConfirm,
    snapPoints,
    scrollable: isScrollable,
  });
  const hasFooter = onConfirm !== undefined;

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

  // Memoized with stable deps only: gorhom remounts the footer whenever this function changes.
  const cancelTitle = t('dialog.cancel');
  const confirmTitle = t('dialog.confirm');
  const cancelTestID = testID ? `${testID}.cancel` : undefined;
  const confirmTestID = testID ? `${testID}.confirm` : undefined;
  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props}>
        <Box style={styles.footer}>
          <Box style={styles.footerButton}>
            <Button
              testID={cancelTestID}
              title={cancelTitle}
              variant="ghost"
              fullWidth
              onPress={onDismissPress}
            />
          </Box>
          <Box style={styles.footerButton}>
            <Button
              testID={confirmTestID}
              title={confirmTitle}
              disabled={isConfirmDisabled}
              fullWidth
              onPress={onConfirmPress}
            />
          </Box>
        </Box>
      </BottomSheetFooter>
    ),
    [
      cancelTestID,
      confirmTestID,
      cancelTitle,
      confirmTitle,
      isConfirmDisabled,
      onDismissPress,
      onConfirmPress,
    ],
  );

  const header = (
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
  );
  const contentStyle = [styles.content, hasFooter && styles.contentWithFooter];

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={points}
      enableDynamicSizing={points === undefined}
      enableContentPanningGesture={false}
      accessible={false}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      footerComponent={hasFooter ? renderFooter : undefined}
      onDismiss={onClose}
    >
      {isScrollable ? (
        <>
          {header}
          <BottomSheetScrollView testID={testID} contentContainerStyle={contentStyle}>
            {children}
          </BottomSheetScrollView>
        </>
      ) : (
        <BottomSheetView testID={testID}>
          {header}
          <Box style={contentStyle}>{children}</Box>
        </BottomSheetView>
      )}
    </BottomSheetModal>
  );
}
