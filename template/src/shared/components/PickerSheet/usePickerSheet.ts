import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useLatest } from '@shared/hooks';

import type { PickerSheetProps } from './types';

const SCROLLABLE_SNAP_POINTS = ['60%'];

/**
 * Presents or dismisses the modal as `visible` changes. `onConfirmPress` keeps one identity for
 * the sheet's whole life (it reads the newest `onConfirm` through a ref), so the memoized footer
 * is not remounted when the draft changes.
 */
export function usePickerSheet({
  visible: isVisible,
  onConfirm,
  snapPoints,
  scrollable: isScrollable = false,
}: Pick<PickerSheetProps, 'visible' | 'onConfirm' | 'snapPoints' | 'scrollable'>) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const latestConfirm = useLatest(onConfirm);
  const points = useMemo(() => {
    if (snapPoints) {
      return [...snapPoints];
    }
    return isScrollable ? SCROLLABLE_SNAP_POINTS : undefined;
  }, [snapPoints, isScrollable]);

  // Dismissing a modal that was never presented leaves gorhom in its DISMISSING state, and the
  // next present() then never shows the sheet. So only dismiss after a present.
  const wasPresentedRef = useRef(false);
  useEffect(() => {
    if (isVisible) {
      wasPresentedRef.current = true;
      sheetRef.current?.present();
    } else if (wasPresentedRef.current) {
      wasPresentedRef.current = false;
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
