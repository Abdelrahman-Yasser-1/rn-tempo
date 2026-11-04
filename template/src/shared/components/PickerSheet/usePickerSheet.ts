import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useLatest } from '@shared/hooks';

import type { PickerSheetProps } from './types';

/**
 * Presents or dismisses the modal as `visible` changes. `onConfirmPress` keeps one identity for
 * the sheet's whole life (it reads the newest `onConfirm` through a ref), so the memoized footer
 * is not remounted when the draft changes.
 */
export function usePickerSheet({
  visible: isVisible,
  onConfirm,
  snapPoints,
}: Pick<PickerSheetProps, 'visible' | 'onConfirm' | 'snapPoints'>) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const latestConfirm = useLatest(onConfirm);
  const points = useMemo(() => (snapPoints ? [...snapPoints] : undefined), [snapPoints]);

  useEffect(() => {
    if (isVisible) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [isVisible]);

  const onDismissPress = useCallback(() => {
    sheetRef.current?.dismiss();
  }, []);

  const onConfirmPress = useCallback(() => {
    latestConfirm.current?.();
    sheetRef.current?.dismiss();
  }, [latestConfirm]);

  return { sheetRef, points, onDismissPress, onConfirmPress };
}
