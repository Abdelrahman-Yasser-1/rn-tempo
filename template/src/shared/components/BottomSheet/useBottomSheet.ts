import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useEffect, useMemo, useRef } from 'react';

import type { BottomSheetProps } from './types';

/** Presents or dismisses the modal as `visible` changes and exposes a stable snap point list. */
export function useBottomSheet({
  visible: isVisible,
  snapPoints,
}: Pick<BottomSheetProps, 'visible' | 'snapPoints'>) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const points = useMemo(() => (snapPoints ? [...snapPoints] : undefined), [snapPoints]);

  useEffect(() => {
    if (isVisible) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [isVisible]);

  const onDismissPress = () => {
    sheetRef.current?.dismiss();
  };

  return { sheetRef, points, onDismissPress };
}
