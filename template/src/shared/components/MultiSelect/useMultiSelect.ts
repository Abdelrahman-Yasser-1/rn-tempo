import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useCallback, useRef, useState } from 'react';

import { useDebounce } from '@shared/hooks';

import type { MultiSelectProps } from './types';

const SEARCH_DEBOUNCE_MS = 250;
/** Up to this many selections show as chips in the field; more collapse to "n selected". */
export const MAX_INLINE_CHIPS = 3;

/**
 * Logic of the multi select: open state, the selection (in option order), the search filter
 * (debounced), toggling, select all and clear, and the sheet's present/dismiss calls.
 */
export function useMultiSelect({
  options,
  value,
  onChange,
  maxSelected,
}: Pick<MultiSelectProps, 'options' | 'value' | 'onChange' | 'maxSelected'>) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const query = useDebounce(search, SEARCH_DEBOUNCE_MS).trim().toLowerCase();

  const selectedOptions = options.filter((option) => value.includes(option.value));
  const visibleOptions =
    query === ''
      ? options
      : options.filter(
          (option) =>
            option.label.toLowerCase().includes(query) ||
            (option.description?.toLowerCase().includes(query) ?? false),
        );
  const isMaxReached = maxSelected !== undefined && selectedOptions.length >= maxSelected;
  const canSelectAll = maxSelected === undefined;
  const hasSelection = selectedOptions.length > 0;

  const onOpen = () => {
    setIsOpen(true);
    sheetRef.current?.present();
  };

  // Stable, so the memoized sheet footer that calls it keeps its identity.
  const onClose = useCallback(() => {
    sheetRef.current?.dismiss();
  }, []);

  const onDismiss = () => {
    setIsOpen(false);
    setSearch('');
  };

  const onToggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((item) => item !== optionValue));
    } else if (!isMaxReached) {
      onChange([...value, optionValue]);
    }
  };

  const onRemove = (optionValue: string) => {
    onChange(value.filter((item) => item !== optionValue));
  };

  const onSelectAll = () => {
    const toAdd = visibleOptions
      .filter((option) => !option.disabled && !value.includes(option.value))
      .map((option) => option.value);
    onChange([...value, ...toAdd]);
  };

  const onClear = () => {
    onChange([]);
  };

  return {
    sheetRef,
    isOpen,
    search,
    selectedOptions,
    visibleOptions,
    hasSelection,
    isMaxReached,
    canSelectAll,
    hasInlineChips: selectedOptions.length <= MAX_INLINE_CHIPS,
    onSearchChange: setSearch,
    onOpen,
    onClose,
    onDismiss,
    onToggle,
    onRemove,
    onSelectAll,
    onClear,
  };
}
