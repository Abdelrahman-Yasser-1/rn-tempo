import { screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { WebViewScreen } from './WebViewScreen';

const mockGoBack = jest.fn();
const { mockReload } = jest.requireMock<{ mockReload: jest.Mock }>('react-native-webview');

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('WebViewScreen', () => {
  it('shows the given title, reloads the page and goes back', async () => {
    const { user } = await renderWithProviders(
      <WebViewScreen
        route={{ params: { url: 'https://dummyjson.com/products/1', title: 'Phone' } }}
      />,
    );
    expect(screen.getByRole('header', { name: 'Phone' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Reload' }));
    expect(mockReload).toHaveBeenCalledTimes(1);
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('falls back to the host as the title and opens the page in the browser', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const { user } = await renderWithProviders(
      <WebViewScreen route={{ params: { url: 'https://dummyjson.com/products/1' } }} />,
    );
    expect(screen.getByRole('header', { name: 'dummyjson.com' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Open in browser' }));
    expect(openURL).toHaveBeenCalledWith('https://dummyjson.com/products/1');
  });

  it('refuses an address that is not https', async () => {
    await renderWithProviders(
      <WebViewScreen route={{ params: { url: 'javascript:alert(1)', title: 'Bad' } }} />,
    );
    expect(screen.getByText('This link cannot be opened here.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Web view')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeOnTheScreen();
  });
});
