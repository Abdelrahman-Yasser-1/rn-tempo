import { renderHook } from '@testing-library/react-native';

import { actAsync } from '@test-utils/act';

import { useDisclosure } from './useDisclosure';

describe('useDisclosure', () => {
  it('starts closed by default', async () => {
    const { result } = await renderHook(() => useDisclosure());
    expect(result.current.isOpen).toBe(false);
  });

  it('can start open', async () => {
    const { result } = await renderHook(() => useDisclosure(true));
    expect(result.current.isOpen).toBe(true);
  });

  it('opens, closes and toggles', async () => {
    const { result } = await renderHook(() => useDisclosure());
    await actAsync(() => {
      result.current.open();
    });
    expect(result.current.isOpen).toBe(true);
    await actAsync(() => {
      result.current.close();
    });
    expect(result.current.isOpen).toBe(false);
    await actAsync(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(true);
    await actAsync(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(false);
  });
});
