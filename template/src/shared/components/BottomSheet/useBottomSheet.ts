import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

import type { BottomSheetProps } from './types';

/** Presents or dismisses the modal as `visible` changes and exposes a stable snap point list and the pinned footer's height. */
export function useBottomSheet({
  visible: isVisible,
  snapPoints,
}: Pick<BottomSheetProps, 'visible' | 'snapPoints'>) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [footerHeight, setFooterHeight] = useState(0);
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

  // The pinned footer floats over the sheet, so its height is reserved at the end of the content.
  const onFooterLayout = useCallback((event: LayoutChangeEvent) => {
    setFooterHeight(event.nativeEvent.layout.height);
  }, []);

  return { sheetRef, points, footerHeight, onFooterLayout, onDismissPress };
}
