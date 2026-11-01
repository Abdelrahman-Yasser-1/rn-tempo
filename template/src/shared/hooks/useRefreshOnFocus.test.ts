import { renderHook } from '@testing-library/react-native';

import { actAsync } from '@test-utils/act';

import { useRefreshOnFocus } from './useRefreshOnFocus';

// Records the focus effect so tests can simulate focus without a navigator.
let mockFocusEffect: (() => unknown) | undefined;

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useFocusEffect: (effect: () => unknown) => {
    mockFocusEffect = effect;
  },
}));

describe('useRefreshOnFocus', () => {
  it('skips the first focus, which is the initial load', async () => {
    const refetch = jest.fn<unknown, []>();
    await renderHook(() => { useRefreshOnFocus(refetch); });
    await actAsync(() => {
      mockFocusEffect?.();
    })
    expect(refetch).not.toHaveBeenCalled();
  });

  it('refetches on every focus after the first', async () => {
    const refetch = jest.fn<unknown, []>();
    await renderHook(() => { useRefreshOnFocus(refetch); });
    await actAsync(() => {
      mockFocusEffect?.();
    })
    await actAsync(() => {
      mockFocusEffect?.();
    })
    await actAsync(() => {
      mockFocusEffect?.();
    })
    expect(refetch).toHaveBeenCalledTimes(2);
  });
});
