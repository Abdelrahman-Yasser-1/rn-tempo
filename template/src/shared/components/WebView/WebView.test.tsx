import { act, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { WebView } from './WebView';

const { mockReload } = jest.requireMock<{ mockReload: jest.Mock }>('react-native-webview');

type Request = {
  url: string;
  isTopFrame: boolean;
  navigationType: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  lockIdentifier: number;
};

const request = (url: string, isTopFrame = true): Request => ({
  url,
  isTopFrame,
  navigationType: 'click',
  title: '',
  loading: true,
  canGoBack: false,
  canGoForward: false,
  lockIdentifier: 0,
});

type NativeProps = {
  onLoadProgress: (event: { nativeEvent: { progress: number } }) => void;
  onError: () => void;
  onShouldStartLoadWithRequest: (request: Request) => boolean;
  source: { uri: string };
};

const nativeProps = () => screen.getByLabelText('Web view').props as NativeProps;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('WebView', () => {
  it('loads the url and shows a progress bar until the page has loaded', async () => {
    await renderWithProviders(<WebView url="https://dummyjson.com/docs" />);
    expect(nativeProps().source).toEqual({ uri: 'https://dummyjson.com/docs' });
    expect(screen.getByRole('progressbar', { name: 'Loading page' })).toBeOnTheScreen();
    await act(() => {
      nativeProps().onLoadProgress({ nativeEvent: { progress: 1 } });
    });
    expect(screen.queryByRole('progressbar')).not.toBeOnTheScreen();
  });

  it('shows the error state and reloads on Retry', async () => {
    const { user } = await renderWithProviders(<WebView url="https://dummyjson.com/docs" />);
    await act(() => {
      nativeProps().onError();
    });
    expect(screen.getByText('Page unavailable')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Retry' }));
    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Page unavailable')).not.toBeOnTheScreen();
  });

  it('reloads when the reload token changes', async () => {
    const { rerender } = await renderWithProviders(
      <WebView url="https://dummyjson.com/docs" reloadToken={0} />,
    );
    expect(mockReload).not.toHaveBeenCalled();
    await rerender(<WebView url="https://dummyjson.com/docs" reloadToken={1} />);
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('keeps allowed pages in the view and opens other links in the browser', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await renderWithProviders(<WebView url="https://dummyjson.com/docs" />);
    expect(nativeProps().onShouldStartLoadWithRequest(request('https://dummyjson.com/x'))).toBe(
      true,
    );
    expect(openURL).not.toHaveBeenCalled();
    expect(nativeProps().onShouldStartLoadWithRequest(request('https://example.com'))).toBe(false);
    await act(async () => {
      await Promise.resolve();
    });
    expect(openURL).toHaveBeenCalledWith('https://example.com');
    expect(nativeProps().onShouldStartLoadWithRequest(request('javascript:alert(1)'))).toBe(false);
    expect(openURL).toHaveBeenCalledTimes(1);
  });
});
