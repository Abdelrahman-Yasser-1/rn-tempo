import { renderHook } from '@testing-library/react-native';
import { I18nManager } from 'react-native';

import { useRtl } from './useRtl';

describe('useRtl', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is false for a left-to-right layout', async () => {
    jest.replaceProperty(I18nManager, 'isRTL', false);
    const { result } = await renderHook(() => useRtl());
    expect(result.current).toBe(false);
  });

  it('is true for a right-to-left layout', async () => {
    jest.replaceProperty(I18nManager, 'isRTL', true);
    const { result } = await renderHook(() => useRtl());
    expect(result.current).toBe(true);
  });
});
