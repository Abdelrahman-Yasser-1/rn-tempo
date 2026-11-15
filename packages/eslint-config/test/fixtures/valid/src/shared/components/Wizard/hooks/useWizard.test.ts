import { renderHook } from '@testing-library/react-native';

import { useWizard } from './useWizard';

describe('useWizard', () => {
  it('AC-1: starts on the first step', () => {
    const { result } = renderHook(() => useWizard());
    expect(result.current).toBe(0);
  });
});
