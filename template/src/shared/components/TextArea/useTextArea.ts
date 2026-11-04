import { useState } from 'react';

import type { TextAreaProps } from './types';

/** Tracks the current length for the counter, whether the value is controlled or not. */
export function useTextArea({
  value,
  defaultValue,
  onChangeText,
}: Pick<TextAreaProps, 'value' | 'defaultValue' | 'onChangeText'>) {
  const [typed, setTyped] = useState(defaultValue ?? '');
  const length = (value ?? typed).length;

  const handleChangeText = (text: string) => {
    setTyped(text);
    onChangeText?.(text);
  };

  return { length, onChangeText: handleChangeText };
}
