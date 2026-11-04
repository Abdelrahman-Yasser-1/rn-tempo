import { useState } from 'react';
import type { GestureResponderEvent } from 'react-native';

import { usePressFeedback } from '@shared/hooks';

import type { ButtonProps } from './types';

type UseButtonParams = Pick<ButtonProps, 'onPressIn' | 'onPressOut'>;

/** Pressed state and animated press feedback for a button; forwards the caller's press handlers. */
export function useButton({ onPressIn, onPressOut }: UseButtonParams) {
  const { animatedStyle, handlers } = usePressFeedback();
  const [isPressed, setIsPressed] = useState(false);

  const handlePressIn = (event: GestureResponderEvent) => {
    setIsPressed(true);
    handlers.onPressIn();
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    setIsPressed(false);
    handlers.onPressOut();
    onPressOut?.(event);
  };

  return { animatedStyle, isPressed, onPressIn: handlePressIn, onPressOut: handlePressOut };
}
