import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useCallback, useRef, useState } from 'react';

import { useDebounce } from '@shared/hooks';

import type { SelectProps } from './types';

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Logic of the select: open state, the selected option, the search filter (debounced) and the
 * sheet's present/dismiss calls.
 */
export function useSelect({
  options,
  value,
  onChange,
}: Pick<SelectProps, 'options' | 'value' | 'onChange'>) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const query = useDebounce(search, SEARCH_DEBOUNCE_MS).trim().toLowerCase();
  const selected = options.find((option) => option.value === value);
  const visibleOptions =
    query === '' ? options : options.filter((option) => option.label.toLowerCase().includes(query));

  const onOpen = () => {
    setIsOpen(true);
    sheetRef.current?.present();
  };

  const onClose = () => {
    sheetRef.current?.dismiss();
  };

  const onDismiss = () => {
    setIsOpen(false);
    setSearch('');
  };

  const onSelect = useCallback(
    (next: string) => {
      onChange(next);
      sheetRef.current?.dismiss();
    },
    [onChange],
  );

  return {
    sheetRef,
    isOpen,
    selected,
    search,
    visibleOptions,
    onSearchChange: setSearch,
    onOpen,
    onClose,
    onDismiss,
    onSelect,
  };
}
