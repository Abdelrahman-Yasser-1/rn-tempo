import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useNotFoundScreen } from './useNotFoundScreen';

const mockDispatch = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ dispatch: mockDispatch }),
}));

beforeEach(() => {
  mockDispatch.mockClear();
});

describe('useNotFoundScreen', () => {
  test.each([
    [true, 'Main'],
    [false, 'Auth'],
  ])('goHome resets to the right root (signed in: %s)', async (isSignedIn, routeName) => {
    const { result } = await renderHookWithProviders(() => useNotFoundScreen(), {
      authenticated: isSignedIn,
    });

    result.current.goHome();

    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'RESET',
        payload: expect.objectContaining({ index: 0, routes: [{ name: routeName }] }) as object,
      }),
    );
  });
});
