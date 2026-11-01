import { renderHook } from '@testing-library/react-native';

import { actAsync } from '@test-utils/act';

import { usePressFeedback } from './usePressFeedback';

/** Approximate match for interpolated values; typed as unknown because expect.closeTo is any. */
const closeTo = (value: number): unknown => expect.closeTo(value);

describe('usePressFeedback', () => {
  it('starts at full opacity and scale', async () => {
    const { result } = await renderHook(() => usePressFeedback());
    expect(result.current.animatedStyle).toMatchObject({
      opacity: closeTo(1),
      transform: [{ scale: closeTo(1) }],
    });
  });

  it('dims and shrinks while pressed, then restores on release', async () => {
    const { result, rerender } = await renderHook(() => usePressFeedback());
    await actAsync(() => {
      result.current.handlers.onPressIn();
    })
    await rerender(undefined);
    expect(result.current.animatedStyle).toMatchObject({
      opacity: closeTo(0.7),
      transform: [{ scale: closeTo(0.97) }],
    });

    await actAsync(() => {
      result.current.handlers.onPressOut();
    })
    await rerender(undefined);
    expect(result.current.animatedStyle).toMatchObject({
      opacity: closeTo(1),
      transform: [{ scale: closeTo(1) }],
    });
  });
});
