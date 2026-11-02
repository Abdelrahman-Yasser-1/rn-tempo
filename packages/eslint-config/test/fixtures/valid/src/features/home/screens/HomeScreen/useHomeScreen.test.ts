import { renderHook } from '@testing-library/react-native';

import { useHomeScreen } from './useHomeScreen';

describe('useHomeScreen', () => {
  it('returns the title', () => {
    const { result } = renderHook(() => useHomeScreen());
    expect(result.current.title).toBeTruthy();
  });
});
