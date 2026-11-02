import { act, renderHook } from '@testing-library/react-native';
import type { BlurEvent, FocusEvent } from 'react-native';

import { useTextField } from './useTextField';

const focusEvent = {} as FocusEvent;
const blurEvent = {} as BlurEvent;

describe('useTextField', () => {
  test('starts unfocused with the password hidden', async () => {
    const { result } = await renderHook(() => useTextField({}));

    expect(result.current.isFocused).toBe(false);
    expect(result.current.isRevealed).toBe(false);
  });

  test('focus and blur toggle the focused state and forward the events', async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    const { result } = await renderHook(() => useTextField({ onFocus, onBlur }));

    await act(() => {
      result.current.onFocus(focusEvent);
      return Promise.resolve();
    });
    expect(result.current.isFocused).toBe(true);
    expect(onFocus).toHaveBeenCalledWith(focusEvent);

    await act(() => {
      result.current.onBlur(blurEvent);
      return Promise.resolve();
    });
    expect(result.current.isFocused).toBe(false);
    expect(onBlur).toHaveBeenCalledWith(blurEvent);
  });

  test('focus and blur work without forwarded handlers', async () => {
    const { result } = await renderHook(() => useTextField({}));

    await act(() => {
      result.current.onFocus(focusEvent);
      return Promise.resolve();
    });

    expect(result.current.isFocused).toBe(true);
  });

  test('onToggleReveal flips the password visibility each time', async () => {
    const { result } = await renderHook(() => useTextField({}));

    await act(() => {
      result.current.onToggleReveal();
      return Promise.resolve();
    });
    expect(result.current.isRevealed).toBe(true);

    await act(() => {
      result.current.onToggleReveal();
      return Promise.resolve();
    });
    expect(result.current.isRevealed).toBe(false);
  });
});
