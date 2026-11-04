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

  it('bumps the reload token', async () => {
    const { result } = await renderHook(() => useWebViewScreen(route));
    await act(() => {
      result.current.onReload();
    });
    expect(result.current.reloadToken).toBe(1);
  });
});
