import RNShake from 'react-native-shake';

import { navigationRef } from '@navigation/navigationRef';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { openDebugMenu, useShakeToOpenDebugMenu } from './useShakeToOpenDebugMenu';

const addListener = jest.mocked(RNShake.addListener);

function fakeRef(options: { isReady: boolean; current?: string }) {
  const navigate = jest.fn();
  jest.spyOn(navigationRef, 'isReady').mockReturnValue(options.isReady);
  jest
    .spyOn(navigationRef, 'getCurrentRoute')
    .mockReturnValue(
      options.current === undefined ? undefined : ({ key: 'k', name: options.current } as never),
    );
  jest.spyOn(navigationRef, 'navigate').mockImplementation(navigate);
  return navigate;
}

describe('openDebugMenu', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('navigates to the debug menu when navigation is ready', () => {
    const navigate = fakeRef({ isReady: true, current: 'Home' });

    expect(openDebugMenu()).toBe(true);
    expect(navigate).toHaveBeenCalledWith('DebugMenu');
  });

  it('does nothing before navigation is ready', () => {
    const navigate = fakeRef({ isReady: false });

    expect(openDebugMenu()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each(['DebugMenu', 'NetworkLog'])('does nothing while %s is showing', (current) => {
    const navigate = fakeRef({ isReady: true, current });

    expect(openDebugMenu()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('useShakeToOpenDebugMenu', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    addListener.mockClear();
  });

  it('opens the debug menu on a shake and unsubscribes on unmount', async () => {
    const navigate = fakeRef({ isReady: true, current: 'Home' });
    const remove = jest.fn();
    addListener.mockReturnValueOnce({ remove });

    const { unmount } = await renderHookWithProviders(() => {
      useShakeToOpenDebugMenu();
    });
    const onShake = addListener.mock.calls[0]?.[0];
    onShake?.();

    expect(navigate).toHaveBeenCalledWith('DebugMenu');
    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
