import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Box } from '../Box';
import { IconButton } from '../IconButton';
import { Text } from '../Text';

import { styles } from './styles';
import type { BottomSheetProps } from './types';

/**
 * Themed bottom sheet (gorhom modal). Needs `BottomSheetModalProvider`, which `AppProviders`
 * mounts. Drive it with `visible`; `onClose` fires on every dismissal so state stays in sync.
 */
export function BottomSheet({
  visible: isVisible,
  onClose,
  title,
  snapPoints,
  children,
  testID,
}: BottomSheetProps) {
  const { t } = useTranslation();
  const sheetRef = useRef<BottomSheetModal>(null);
  const points = useMemo(() => (snapPoints ? [...snapPoints] : undefined), [snapPoints]);

  useEffect(() => {
    if (isVisible) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [isVisible]);

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
              onPress={() => {
                sheetRef.current?.dismiss();
              }}
            />
          </Box>
        )}
        <Box style={styles.content}>{children}</Box>
      </BottomSheetView>
    </BottomSheetModal>
  );
}
