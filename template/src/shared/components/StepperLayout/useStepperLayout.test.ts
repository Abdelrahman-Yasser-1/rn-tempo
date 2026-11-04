import { act, renderHook } from '@testing-library/react-native';
import { BackHandler } from 'react-native';

import { actAsync } from '@test-utils/act';

import { useStepperLayout } from './useStepperLayout';

const steps = [
  { key: 'one', label: 'One', content: null },
  { key: 'two', label: 'Two', content: null },
  { key: 'three', label: 'Three', content: null },
];

describe('useStepperLayout', () => {
  it('moves with next, back and goTo, clamped to the steps', async () => {
    const onExit = jest.fn();
    const { result } = await renderHook(() =>
      useStepperLayout({ steps, onExit, onSubmit: jest.fn() }),
    );
    await act(() => result.current.next());
    expect(result.current.current).toBe(1);

    await actAsync(() => {
      result.current.goTo(99);
    });
    expect(result.current.current).toBe(2);
    expect(result.current.isLast).toBe(true);

    await actAsync(() => {
      result.current.back();
    });
    expect(result.current.current).toBe(1);

    await actAsync(() => {
      result.current.goTo(0);
    });
    await actAsync(() => {
      result.current.back();
    });
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('does nothing while the gate is closed', async () => {
    const { result } = await renderHook(() =>
      useStepperLayout({ steps, onExit: jest.fn(), onSubmit: jest.fn(), canGoNext: false }),
    );
    expect(result.current.canGoNext).toBe(false);
    await act(() => result.current.next());
    expect(result.current.current).toBe(0);
  });

  it('validates before moving on and submits from the last step', async () => {
    const validate = jest.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const onSubmit = jest.fn();
    const { result } = await renderHook(() =>
      useStepperLayout({
        steps: [{ key: 'only', label: 'Only', content: null, validate }],
        onExit: jest.fn(),
        onSubmit,
      }),
    );
    await act(() => result.current.next());
    expect(onSubmit).not.toHaveBeenCalled();
    await act(() => result.current.next());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('consumes Android back to step back, and lets the system handle the first step', async () => {
    const addListener = jest.spyOn(BackHandler, 'addEventListener');
    const { result } = await renderHook(() =>
      useStepperLayout({ steps, onExit: jest.fn(), onSubmit: jest.fn(), initialStep: 1 }),
    );
    // The hook re-subscribes with the latest closure; the newest listener is the live one.
    const latest = () => addListener.mock.calls.at(-1)?.[1] as unknown as () => boolean;

    let isConsumed = false;
    await actAsync(() => {
      isConsumed = latest()();
    });
    expect(isConsumed).toBe(true);
    expect(result.current.current).toBe(0);
    expect(latest()()).toBe(false);
    addListener.mockRestore();
  });
});
