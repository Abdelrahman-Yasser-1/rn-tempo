import { useState } from 'react';

import type { TextFieldProps } from './types';

/** Logic of the text field: focus state, forwarded focus/blur handlers and password reveal. */
export function useTextField({ onFocus, onBlur }: Pick<TextFieldProps, 'onFocus' | 'onBlur'>) {
  const [isFocused, setIsFocused] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);

  const handleFocus: NonNullable<TextFieldProps['onFocus']> = (event) => {
    setIsFocused(true);
    onFocus?.(event);
  };

  const handleBlur: NonNullable<TextFieldProps['onBlur']> = (event) => {
    setIsFocused(false);
    onBlur?.(event);
  };

  const onToggleReveal = () => {
    setIsRevealed((isShown) => !isShown);
  };

  return { isFocused, isRevealed, onFocus: handleFocus, onBlur: handleBlur, onToggleReveal };
}
