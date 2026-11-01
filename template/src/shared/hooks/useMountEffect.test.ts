import { renderHook } from '@testing-library/react-native';

import { useMountEffect } from './useMountEffect';

describe('useMountEffect', () => {
  it('runs the effect once on mount', async () => {
    const effect = jest.fn();
    const { rerender } = await renderHook(() => { useMountEffect(effect); });
    expect(effect).toHaveBeenCalledTimes(1);
    await rerender(undefined);
    expect(effect).toHaveBeenCalledTimes(1);
  });

  it('runs the cleanup on unmount', async () => {
    const cleanup = jest.fn();
    const { unmount } = await renderHook(() => { useMountEffect(() => {
        return cleanup;
      }); },
    );
    expect(cleanup).not.toHaveBeenCalled();
    await unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
