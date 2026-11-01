import { renderHook } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

import { actAsync } from '@test-utils/act';

import { useKeyboard } from './useKeyboard';

function listenerFor(calls: readonly (readonly unknown[])[], event: string) {
  const call = calls.find(([name]) => name === event);
  return call?.[1] as (payload?: unknown) => void;
}

describe('useKeyboard', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is hidden with zero height initially', async () => {
    const { result } = await renderHook(() => useKeyboard());
    expect(result.current).toEqual({ isVisible: false, height: 0 });
  });

  it('reports the keyboard height when it shows and clears it when it hides', async () => {
    const addListener = jest.spyOn(Keyboard, 'addListener');
    const { result } = await renderHook(() => useKeyboard());

    await actAsync(() => {
      listenerFor(addListener.mock.calls, 'keyboardWillShow')({ endCoordinates: { height: 300 } })
    });
    expect(result.current).toEqual({ isVisible: true, height: 300 });

    await actAsync(() => {
      listenerFor(addListener.mock.calls, 'keyboardWillHide')();
    })
    expect(result.current).toEqual({ isVisible: false, height: 0 });
  });

  it('removes both listeners on unmount', async () => {
    const addListener = jest.spyOn(Keyboard, 'addListener');
    const { unmount } = await renderHook(() => useKeyboard());
    const show = addListener.mock.results[0]?.value as { remove: () => void };
    const hide = addListener.mock.results[1]?.value as { remove: () => void };
    const removeShow = jest.spyOn(show, 'remove');
    const removeHide = jest.spyOn(hide, 'remove');
    await unmount();
    expect(removeShow).toHaveBeenCalledTimes(1);
    expect(removeHide).toHaveBeenCalledTimes(1);
  });
});
