import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useCallback, useRef, useState } from 'react';

import type { SelectProps } from './types';

/** Logic of the select: open state, the selected option and the sheet's present/dismiss calls. */
export function useSelect({
  options,
  value,
  onChange,
}: Pick<SelectProps, 'options' | 'value' | 'onChange'>) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  const onOpen = () => {
    setIsOpen(true);
    sheetRef.current?.present();
  };

  const onClose = () => {
    sheetRef.current?.dismiss();
  };

  const onDismiss = () => {
    setIsOpen(false);
  };

  const onSelect = useCallback(
    (next: string) => {
      onChange(next);
      sheetRef.current?.dismiss();
    },
    [onChange],
  );

  return { sheetRef, isOpen, selected, onOpen, onClose, onDismiss, onSelect };
}
