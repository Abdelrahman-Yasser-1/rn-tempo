import { useState } from 'react';

import type { NumberInputProps } from './types';

type UseNumberInputParams = Pick<NumberInputProps, 'value' | 'onChange' | 'formatValue'> &
  Readonly<{ min: number; max: number; step: number }>;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Logic of the number input: the text being typed (digits only), the − and + steps, and clamping
 * to `min` and `max` when editing ends.
 */
export function useNumberInput({
  value,
  onChange,
  formatValue,
  min,
  max,
  step,
}: UseNumberInputParams) {
  // `null` while the field is not being edited; then the formatted value is shown.
  const [draft, setDraft] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const text = draft ?? (formatValue ? formatValue(value) : String(value));

  const commit = (next: number) => {
    const clamped = clamp(next, min, max);
    if (clamped !== value) {
      onChange(clamped);
    }
  };

  const onFocus = () => {
    setIsFocused(true);
    setDraft(String(value));
  };

  const onChangeText = (input: string) => {
    setDraft(input.replaceAll(/\D/g, ''));
  };

  // An empty field leaves the value alone; anything else is clamped.
  const onEndEditing = () => {
    setIsFocused(false);
    if (draft !== null && draft !== '') {
      commit(Number(draft));
    }
    setDraft(null);
  };

  const onIncrement = () => {
    commit(value + step);
  };

  const onDecrement = () => {
    commit(value - step);
  };

  return {
    text,
    isFocused,
    canIncrement: value < max,
    canDecrement: value > min,
    onFocus,
    onChangeText,
    onEndEditing,
    onIncrement,
    onDecrement,
  };
}
