import { renderHook } from '@testing-library/react-native';
import { I18nManager } from 'react-native';

import { useRTL } from './useRTL';

describe('useRTL', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is false for a left-to-right layout', async () => {
    jest.replaceProperty(I18nManager, 'isRTL', false);
    const { result } = await renderHook(() => useRTL());
    expect(result.current).toBe(false);
  });

  it('is true for a right-to-left layout', async () => {
    jest.replaceProperty(I18nManager, 'isRTL', true);
    const { result } = await renderHook(() => useRTL());
    expect(result.current).toBe(true);
  });
});
