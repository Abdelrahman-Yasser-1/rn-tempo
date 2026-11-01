import { renderHook } from '@testing-library/react-native';

import { useLatest } from './useLatest';

describe('useLatest', () => {
  it('exposes the value from the most recent commit', async () => {
    const { result, rerender } = await renderHook(({ value }: { value: string | number }) => useLatest(value), {
      initialProps: { value: 'first' },
    });
    expect(result.current.current).toBe('first');
    await rerender({ value: 'second' });
    expect(result.current.current).toBe('second');
  });

  it('keeps the same ref object across renders', async () => {
    const { result, rerender } = await renderHook(({ value }: { value: string | number }) => useLatest(value), {
      initialProps: { value: 1 },
    });
    const firstRef = result.current;
    await rerender({ value: 2 });
    expect(result.current).toBe(firstRef);
  });
});
