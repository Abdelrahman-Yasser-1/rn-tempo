import { renderHook } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import { useScreenLayout } from './useScreenLayout';

describe('useScreenLayout', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts hidden and shifted down when animated', async () => {
    const { result } = await renderHook(() => useScreenLayout(true));
    expect(result.current.contentStyle).toEqual({
      opacity: 0,
      transform: [{ translateY: 16 }],
    });
  });

  it('shows the content in place at once when not animated', async () => {
    const { result } = await renderHook(() => useScreenLayout(false));
    expect(result.current.contentStyle).toEqual({
      opacity: 1,
      transform: [{ translateY: 0 }],
    });
  });

  it('skips the entrance under reduced motion', async () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    const { result } = await renderHook(() => useScreenLayout(true));
    expect(result.current.contentStyle).toEqual({
      opacity: 1,
      transform: [{ translateY: 0 }],
    });
  });
});
