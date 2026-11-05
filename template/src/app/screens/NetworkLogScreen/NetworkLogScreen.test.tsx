import { useNavigation } from '@react-navigation/native';
import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { NetworkLogScreen } from './NetworkLogScreen';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: jest.fn(),
}));

describe('NetworkLogScreen', () => {
  it('renders the viewer under a header and goes back from the header', async () => {
    const goBack = jest.fn();
    jest.mocked(useNavigation).mockReturnValue({ goBack });
    const { user } = await renderWithProviders(<NetworkLogScreen />);

    // eslint-disable-next-line no-restricted-syntax -- the viewer is a third-party view with no role
    expect(screen.getByTestId('network-logger')).toBeOnTheScreen();
    expect(screen.getByText('Network log')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Back' }));

    expect(goBack).toHaveBeenCalledTimes(1);
  });
});
