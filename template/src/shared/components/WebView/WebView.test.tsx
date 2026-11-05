import { act, screen } from '@testing-library/react-native';

import { openUrlSafe } from '@services/linking/linking';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { WebView } from './WebView';

jest.mock('@services/linking/linking', () => ({
  openUrlSafe: jest.fn(() => Promise.resolve(true)),
}));

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
  onHttpError: () => void;
  onNavigationStateChange: (state: { url: string; title: string }) => void;
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

  it('reports the load progress to assistive technology', async () => {
    await renderWithProviders(<WebView url="https://dummyjson.com/docs" testID="web" />);
    await act(() => {
      nativeProps().onLoadProgress({ nativeEvent: { progress: 0.4 } });
    });
    expect(screen.getByRole('progressbar')).toHaveProp('accessibilityValue', {
      min: 0,
      max: 100,
      now: 40,
    });
  });

  it('shows the error state for an HTTP error too, without the progress bar', async () => {
    await renderWithProviders(<WebView url="https://dummyjson.com/docs" />);
    await act(() => {
      nativeProps().onHttpError();
    });
    expect(screen.getByText('Page unavailable')).toBeOnTheScreen();
    expect(screen.queryByRole('progressbar')).not.toBeOnTheScreen();
  });

  it('clears the error and restarts the progress bar when reloading by token', async () => {
    const { rerender } = await renderWithProviders(
      <WebView url="https://dummyjson.com/docs" reloadToken={0} />,
    );
    await act(() => {
      nativeProps().onLoadProgress({ nativeEvent: { progress: 1 } });
    });
    await act(() => {
      nativeProps().onError();
    });
    await rerender(<WebView url="https://dummyjson.com/docs" reloadToken={1} />);
    expect(screen.queryByText('Page unavailable')).not.toBeOnTheScreen();
    expect(screen.getByRole('progressbar')).toBeOnTheScreen();
    await rerender(<WebView url="https://dummyjson.com/docs" reloadToken={2} />);
    expect(mockReload).toHaveBeenCalledTimes(2);
  });

  it('reports the page address and title as the user navigates', async () => {
    const onPageChange = jest.fn();
    await renderWithProviders(
      <WebView url="https://dummyjson.com/docs" onPageChange={onPageChange} />,
    );
    await act(() => {
      nativeProps().onNavigationStateChange({
        url: 'https://dummyjson.com/docs/products',
        title: 'Products',
      });
    });
    expect(onPageChange).toHaveBeenCalledWith({
      url: 'https://dummyjson.com/docs/products',
      title: 'Products',
    });
  });

  it('loads https links on the same host and its subdomains without opening the browser', async () => {
    await renderWithProviders(<WebView url="https://dummyjson.com/docs" />);
    expect(nativeProps().onShouldStartLoadWithRequest(request('https://dummyjson.com/x'))).toBe(
      true,
    );
    expect(nativeProps().onShouldStartLoadWithRequest(request('https://cdn.dummyjson.com/a'))).toBe(
      true,
    );
    expect(openUrlSafe).not.toHaveBeenCalled();
  });

  it('honours allowedHosts instead of the host of the url', async () => {
    await renderWithProviders(
      <WebView url="https://dummyjson.com/docs" allowedHosts={['example.com']} />,
    );
    expect(nativeProps().onShouldStartLoadWithRequest(request('https://example.com/a'))).toBe(true);
    expect(nativeProps().onShouldStartLoadWithRequest(request('https://dummyjson.com/a'))).toBe(
      false,
    );
    expect(openUrlSafe).toHaveBeenCalledWith('https://dummyjson.com/a');
  });

  it.each([
    'https://example.com/other',
    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- the policy must refuse cleartext pages
    'http://dummyjson.com/docs',
    'mailto:help@example.com',
    'tel:+966500000000',
    'sms:+966500000000',
  ])('hands %s to the system and refuses to load it', async (url) => {
    await renderWithProviders(<WebView url="https://dummyjson.com/docs" />);
    expect(nativeProps().onShouldStartLoadWithRequest(request(url))).toBe(false);
    expect(openUrlSafe).toHaveBeenCalledTimes(1);
    expect(openUrlSafe).toHaveBeenCalledWith(url);
  });

  it.each([
    'javascript:alert(1)',
    'intent://x#Intent;end',
    'file:///etc/passwd',
    'data:text/html,x',
  ])('drops %s without opening anything', async (url) => {
    await renderWithProviders(<WebView url="https://dummyjson.com/docs" />);
    expect(nativeProps().onShouldStartLoadWithRequest(request(url))).toBe(false);
    expect(openUrlSafe).not.toHaveBeenCalled();
  });

  it('lets frames inside the page load web content', async () => {
    await renderWithProviders(<WebView url="https://dummyjson.com/docs" />);
    expect(
      nativeProps().onShouldStartLoadWithRequest(request('https://www.youtube.com/embed/x', false)),
    ).toBe(true);
    expect(openUrlSafe).not.toHaveBeenCalled();
  });
});
