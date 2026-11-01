import { renderHook } from '@testing-library/react-native';

import { actAsync } from '@test-utils/act';

import { useOnFocus } from './useOnFocus';

// Records the focus effect so tests can simulate the screen gaining focus without a navigator.
let mockFocusEffect: (() => unknown) | undefined;

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useFocusEffect: (effect: () => unknown) => {
    mockFocusEffect = effect;
  },
}));

describe('useOnFocus', () => {
  it('runs the callback each time the screen gains focus', async () => {
    const callback = jest.fn<unknown, []>();
    await renderHook(() => { useOnFocus(callback); });
    await actAsync(() => {
      mockFocusEffect?.();
    })
    await actAsync(() => {
      mockFocusEffect?.();
    })
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('calls the latest callback', async () => {
    const first = jest.fn<unknown, []>();
    const second = jest.fn<unknown, []>();
    const { rerender } = await renderHook(({ fn }: { fn: () => void }) => { useOnFocus(fn); }, {
      initialProps: { fn: first },
    });
    await rerender({ fn: second });
    await actAsync(() => {
      mockFocusEffect?.();
    })
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
