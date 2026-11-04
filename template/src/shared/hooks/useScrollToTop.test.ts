import { renderHook } from '@testing-library/react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { actAsync } from '@test-utils/act';

import { useScrollToTop } from './useScrollToTop';

const scrollEvent = (y: number) =>
  ({ nativeEvent: { contentOffset: { x: 0, y } } }) as NativeSyntheticEvent<NativeScrollEvent>;

describe('useScrollToTop', () => {
  it('becomes visible once the offset passes the threshold', async () => {
    const { result } = await renderHook(() => useScrollToTop({ current: null }, 100));
    expect(result.current.isVisible).toBe(false);

    await actAsync(() => {
      result.current.onScroll(scrollEvent(150));
    });
    expect(result.current.isVisible).toBe(true);

    await actAsync(() => {
      result.current.onScroll(scrollEvent(20));
    });
    expect(result.current.isVisible).toBe(false);
  });

  it('scrolls a ScrollView back to the top', async () => {
    const scrollTo = jest.fn();
    const { result } = await renderHook(() => useScrollToTop({ current: { scrollTo } }));
    result.current.scrollToTop();
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: true });
  });

  it('scrolls a FlashList back to the top through scrollToOffset', async () => {
    const scrollToOffset = jest.fn();
    const { result } = await renderHook(() => useScrollToTop({ current: { scrollToOffset } }));
    result.current.scrollToTop();
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
  });

  it('does nothing without a mounted list', async () => {
    const { result } = await renderHook(() => useScrollToTop({ current: null }));
    expect(() => {
      result.current.scrollToTop();
    }).not.toThrow();
  });

  it('stays hidden exactly at the threshold and shows just past it', async () => {
    const { result } = await renderHook(() => useScrollToTop({ current: null }, 100));
    await actAsync(() => {
      result.current.onScroll(scrollEvent(100));
    });
    expect(result.current.isVisible).toBe(false);
    await actAsync(() => {
      result.current.onScroll(scrollEvent(101));
    });
    expect(result.current.isVisible).toBe(true);
  });

  it('uses a default threshold of 300 points', async () => {
    const { result } = await renderHook(() => useScrollToTop({ current: null }));
    await actAsync(() => {
      result.current.onScroll(scrollEvent(300));
    });
    expect(result.current.isVisible).toBe(false);
    await actAsync(() => {
      result.current.onScroll(scrollEvent(301));
    });
    expect(result.current.isVisible).toBe(true);
  });

  it('prefers scrollToOffset when the target has both methods', async () => {
    const scrollTo = jest.fn();
    const scrollToOffset = jest.fn();
    const { result } = await renderHook(() =>
      useScrollToTop({ current: { scrollTo, scrollToOffset } }),
    );
    result.current.scrollToTop();
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls whichever list the ref points at when the ref is filled later', async () => {
    const ref: { current: { scrollTo?: jest.Mock } | null } = { current: null };
    const { result } = await renderHook(() => useScrollToTop(ref));
    const scrollTo = jest.fn();
    ref.current = { scrollTo };
    result.current.scrollToTop();
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: true });
  });
});
