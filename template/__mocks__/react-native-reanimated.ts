/**
 * Minimal Reanimated stand-in for Jest. Reanimated 4 cannot start its JS fallback under Jest
 * (`setCSSEventHandler` throws), so the real package and its `/mock` entry never load. Tests only
 * need the press-feedback surface: shared values update immediately and animated styles are
 * evaluated once. Auto-applied because it sits in the root `__mocks__` folder.
 */
import { useState } from 'react';
import { ScrollView as RNScrollView, View as RNView } from 'react-native';

type SharedValue<T> = { value: T; set: (next: T) => void };

function createSharedValue<T>(initialValue: T): SharedValue<T> {
  const shared: SharedValue<T> = {
    value: initialValue,
    set(next: T) {
      shared.value = next;
    },
  };
  return shared;
}

export function useSharedValue<T>(initialValue: T): SharedValue<T> {
  const [shared] = useState(() => createSharedValue(initialValue));
  return shared;
}

// eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- name mirrors the Reanimated export
export function useAnimatedStyle<T>(updater: () => T): T {
  return updater();
}

export function withTiming<T>(toValue: T): T {
  return toValue;
}

export function interpolate(
  value: number,
  input: readonly number[],
  output: readonly number[],
): number {
  const [inStart = 0, inEnd = 1] = input;
  const [outStart = 0, outEnd = 1] = output;
  const progress = inEnd === inStart ? 0 : (value - inStart) / (inEnd - inStart);
  return outStart + Math.min(Math.max(progress, 0), 1) * (outEnd - outStart);
}

// eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- name mirrors the Reanimated export
export function useReducedMotion(): boolean {
  return false;
}

/* eslint-disable import-x/no-default-export -- the mock must mirror the library's default export */
export default {
  View: RNView,
  ScrollView: RNScrollView,
};
