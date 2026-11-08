import { renderHook } from '@testing-library/react-native';

import { SECRET_TAP_COUNT, SECRET_TAP_WINDOW_MS } from '@features/settings/constants';

import { useSecretTap } from './useSecretTap';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

/** Fires `count` taps, `gapMs` apart, against the handler returned by the hook. */
function tap(press: () => void, count: number, gapMs: number) {
  for (let index = 0; index < count; index += 1) {
    press();
    jest.advanceTimersByTime(gapMs);
  }
}

describe('useSecretTap', () => {
  test('AC-4: calls onUnlock on the fifth tap inside the window', async () => {
    const onUnlock = jest.fn();
    const { result } = await renderHook(() => useSecretTap(onUnlock));

    tap(result.current, SECRET_TAP_COUNT - 1, 100);
    expect(onUnlock).not.toHaveBeenCalled();

    result.current();
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  test('AC-4: four taps never unlock', async () => {
    const onUnlock = jest.fn();
    const { result } = await renderHook(() => useSecretTap(onUnlock));

    tap(result.current, SECRET_TAP_COUNT - 1, 100);

    expect(onUnlock).not.toHaveBeenCalled();
  });

  test('AC-4: taps spread beyond the window do not add up', async () => {
    const onUnlock = jest.fn();
    const { result } = await renderHook(() => useSecretTap(onUnlock));

    // Five taps, each one more than the window apart from the previous one.
    tap(result.current, SECRET_TAP_COUNT, SECRET_TAP_WINDOW_MS + 1);

    expect(onUnlock).not.toHaveBeenCalled();
  });

  test('AC-4: old taps fall out of the window, so the recent ones still count', async () => {
    const onUnlock = jest.fn();
    const { result } = await renderHook(() => useSecretTap(onUnlock));

    result.current();
    jest.advanceTimersByTime(SECRET_TAP_WINDOW_MS + 1);
    tap(result.current, SECRET_TAP_COUNT - 1, 100);
    expect(onUnlock).not.toHaveBeenCalled();

    result.current();
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  test('AC-4: the count restarts after an unlock', async () => {
    const onUnlock = jest.fn();
    const { result } = await renderHook(() => useSecretTap(onUnlock));

    tap(result.current, SECRET_TAP_COUNT, 100);
    expect(onUnlock).toHaveBeenCalledTimes(1);

    tap(result.current, SECRET_TAP_COUNT - 1, 100);
    expect(onUnlock).toHaveBeenCalledTimes(1);

    result.current();
    expect(onUnlock).toHaveBeenCalledTimes(2);
  });
});
