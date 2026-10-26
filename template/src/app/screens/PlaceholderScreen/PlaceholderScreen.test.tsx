import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { PlaceholderScreen } from './PlaceholderScreen';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useRoute: () => ({ name: 'Login' }),
}));

describe('PlaceholderScreen', () => {
  test('shows the route name and the not-built notice', async () => {
    await renderWithProviders(<PlaceholderScreen />);

    expect(screen.getByText('Login')).toBeOnTheScreen();
    expect(screen.getByText('This screen is not built yet.')).toBeOnTheScreen();
  });
});
