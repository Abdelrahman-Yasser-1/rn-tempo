import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { NotFoundScreen } from './NotFoundScreen';

const mockDispatch = jest.fn();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ dispatch: mockDispatch }),
}));

beforeEach(() => {
  mockDispatch.mockClear();
});

describe('NotFoundScreen', () => {
  test.each([
    [true, 'Main'],
    [false, 'Auth'],
  ])('Go home resets to the right root (signed in: %s)', async (isSignedIn, routeName) => {
    const { user } = await renderWithProviders(<NotFoundScreen />, { authenticated: isSignedIn });

    await user.press(screen.getByRole('button', { name: 'Go home' }));

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'RESET',
        payload: expect.objectContaining({ routes: [{ name: routeName }] }) as object,
      }),
    );
  });

  test('shows the not found message', async () => {
    await renderWithProviders(<NotFoundScreen />);

    expect(screen.getByRole('header', { name: 'Page not found' })).toBeOnTheScreen();
  });
});
