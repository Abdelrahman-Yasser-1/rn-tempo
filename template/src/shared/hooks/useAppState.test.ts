import { renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { actAsync } from '@test-utils/act';

import { useAppState } from './useAppState';

// The Jest preset mocks `AppState.currentState` as a function, so tests set it explicitly.
const originalState: unknown = AppState.currentState;

function setCurrentState(state: unknown) {
  Object.assign(AppState, { currentState: state });
}

describe('useAppState', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    setCurrentState(originalState);
  });

  it('reports the current app state on mount', async () => {
    setCurrentState('background');
    const { result } = await renderHook(() => useAppState());
    expect(result.current).toBe('background');
  });

  it('treats unknown states as active', async () => {
    setCurrentState('unknown');
    const { result } = await renderHook(() => useAppState());
    expect(result.current).toBe('active');
  });

  it('updates when the app state changes', async () => {
    setCurrentState('active');
    const addListener = jest.spyOn(AppState, 'addEventListener');
    const { result } = await renderHook(() => useAppState());

    const listener = addListener.mock.calls.filter(([type]) => type === 'change').at(-1)?.[1];
    await actAsync(() => {
      listener?.('inactive');
    });
    expect(result.current).toBe('inactive');
  });

  it('unsubscribes on unmount', async () => {
    const addListener = jest.spyOn(AppState, 'addEventListener');
    const { unmount } = await renderHook(() => useAppState());
    await unmount();
    // The app's TanStack focus manager also subscribes; the hook's own subscription comes last.
    const own = addListener.mock.results.at(-1)?.value as { remove: jest.Mock };
    expect(own.remove).toHaveBeenCalledTimes(1);
  });
});
