import { useRef, useState } from 'react';
import type { TextInputInstance } from 'react-native';

import type { OtpInputProps } from './types';

export const DEFAULT_LENGTH = 6;

type UseOtpInputParams = Pick<OtpInputProps, 'value' | 'onChangeText' | 'onComplete'> &
  Readonly<{ length: number }>;

/** Logic of the OTP input: cell focus, auto-advance, backspace-to-previous and paste/autofill. */
export function useOtpInput({ value, onChangeText, onComplete, length }: UseOtpInputParams) {
  const cellsRef = useRef<(TextInputInstance | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const cells = Array.from({ length }, (_, index) => index);

  const commit = (next: string, focusIndex: number) => {
    onChangeText(next);
    cellsRef.current[Math.min(focusIndex, length - 1)]?.focus();
    if (next.length === length) {
      onComplete?.(next);
    }
  };

  const setCellRef = (index: number, node: TextInputInstance | null) => {
    cellsRef.current[index] = node;
  };

  const onCellChange = (index: number, text: string) => {
    const digits = text.replaceAll(/\D/g, '');
    const padded = value.padEnd(index, ' ');
    if (digits === '') {
      commit((padded.slice(0, index) + padded.slice(index + 1)).trimEnd(), index);
      return;
    }
    // More than one digit means a paste or an SMS autofill: spread it from this cell.
    const next = (padded.slice(0, index) + digits + padded.slice(index + digits.length))
      .slice(0, length)
      .trimEnd();
    commit(next, index + digits.length);
  };

  const onCellBackspace = (index: number) => {
    if (value[index] === undefined && index > 0) {
      commit(value.slice(0, index - 1), index - 1);
    }
  };

  const onCellFocus = (index: number) => {
    setFocusedIndex(index);
  };

  const onCellBlur = (index: number) => {
    setFocusedIndex((current) => (current === index ? null : current));
  };

  return {
    cells,
    focusedIndex,
    setCellRef,
    onCellChange,
    onCellBackspace,
    onCellFocus,
    onCellBlur,
  };
}
