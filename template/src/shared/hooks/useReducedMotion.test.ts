import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { actAsync } from '@test-utils/act';


import { useReducedMotion } from './useReducedMotion';

describe('useReducedMotion', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads the OS setting on mount', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const { result } = await renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('follows live changes to the OS setting', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const addListener = jest.spyOn(AccessibilityInfo, 'addEventListener');
    const { result } = await renderHook(() => useReducedMotion());
    // Let the initial OS read settle first, so it cannot overwrite the live update below.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(false);

    const listener = addListener.mock.calls
      .filter(([type]) => type === 'reduceMotionChanged')
      .at(-1)?.[1];
    await actAsync(() => {
      listener?.(true);
    });
    expect(result.current).toBe(true);
  });
});
