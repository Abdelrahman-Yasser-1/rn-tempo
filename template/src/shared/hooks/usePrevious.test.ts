import { renderHook } from '@testing-library/react-native';

import { usePrevious } from './usePrevious';

describe('usePrevious', () => {
  it('is undefined on the first render', async () => {
    const seen: (string | undefined)[] = [];
    await renderHook(
      ({ value }: { value: string }) => {
        const previous = usePrevious(value);
        seen.push(previous);
        return previous;
      },
      { initialProps: { value: 'a' } },
    );
    expect(seen[0]).toBeUndefined();
  });

  it('returns the value from before the latest change', async () => {
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => usePrevious(value),
      {
        initialProps: { value: 'a' },
      },
    );
    await rerender({ value: 'b' });
    expect(result.current).toBe('a');
    await rerender({ value: 'c' });
    expect(result.current).toBe('b');
  });
});
