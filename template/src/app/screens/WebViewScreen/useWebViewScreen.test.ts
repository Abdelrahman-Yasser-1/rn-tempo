import { act, renderHook } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { useWebViewScreen } from './useWebViewScreen';

const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack }),
}));

const route = { params: { url: 'https://dummyjson.com/products/1' } };

describe('useWebViewScreen', () => {
  beforeEach(() => {
    // `Linking.openURL` is already a mock in the RN preset, so spies share its calls.
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('prefers the given title, then the page title, then the host', async () => {
    const { result, rerender } = await renderHook(
      (params: { url: string; title?: string }) => useWebViewScreen({ params }),
      { initialProps: { ...route.params, title: 'Given' } },
    );
    expect(result.current.title).toBe('Given');
    await rerender(route.params);
    expect(result.current.title).toBe('dummyjson.com');
    await act(() => {
      result.current.onPageChange({ url: route.params.url, title: 'Page title' });
    });
    expect(result.current.title).toBe('Page title');
  });

  it('opens the page the view is on, not the first address', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const { result } = await renderHook(() => useWebViewScreen(route));
    await act(() => {
      result.current.onPageChange({ url: 'https://dummyjson.com/docs', title: '' });
    });
    await act(() => {
      result.current.onOpenInBrowser();
    });
    expect(openURL).toHaveBeenCalledWith('https://dummyjson.com/docs');
  });

  it('does not open a page address that is not https', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const { result } = await renderHook(() => useWebViewScreen(route));
    await act(() => {
      result.current.onPageChange({ url: 'javascript:alert(1)', title: '' });
    });
    await act(() => {
      result.current.onOpenInBrowser();
    });
    expect(openURL).not.toHaveBeenCalled();
  });

  it('uses the host again while the page title is empty', async () => {
    const { result } = await renderHook(() => useWebViewScreen(route));
    await act(() => {
      result.current.onPageChange({ url: route.params.url, title: '' });
    });
    expect(result.current.title).toBe('dummyjson.com');
  });

  it('flags only absolute https addresses as secure', async () => {
    const secure = (url: string) =>
      renderHook(() => useWebViewScreen({ params: { url } })).then(
        ({ result }) => result.current.isSecure,
      );
    await expect(secure('https://dummyjson.com')).resolves.toBe(true);
    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- the screen must refuse cleartext
    await expect(secure('http://dummyjson.com')).resolves.toBe(false);
    await expect(secure('mailto:a@b.test')).resolves.toBe(false);
    await expect(secure('')).resolves.toBe(false);
  });

  it('goes back through the navigator', async () => {
    const { result } = await renderHook(() => useWebViewScreen(route));
    result.current.onBack();
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('bumps the reload token', async () => {
    const { result } = await renderHook(() => useWebViewScreen(route));
    await act(() => {
      result.current.onReload();
    });
    expect(result.current.reloadToken).toBe(1);
  });
});
