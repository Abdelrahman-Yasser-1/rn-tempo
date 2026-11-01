import { renderHook } from '@testing-library/react-native';

import { actAsync } from '@test-utils/act';

import { useToggle } from './useToggle';

describe('useToggle', () => {
  it('starts off by default and flips on toggle', async () => {
    const { result } = await renderHook(() => useToggle());
    expect(result.current[0]).toBe(false);
    await actAsync(() => {
      result.current[1]();
    })
    expect(result.current[0]).toBe(true);
  });

  it('can start on', async () => {
    const { result } = await renderHook(() => useToggle(true));
    expect(result.current[0]).toBe(true);
  });

  it('sets an explicit value through the setter', async () => {
    const { result } = await renderHook(() => useToggle());
    await actAsync(() => {
      result.current[2](true);
    })
    expect(result.current[0]).toBe(true);
    await actAsync(() => {
      result.current[2](false);
    })
    expect(result.current[0]).toBe(false);
  });
});
