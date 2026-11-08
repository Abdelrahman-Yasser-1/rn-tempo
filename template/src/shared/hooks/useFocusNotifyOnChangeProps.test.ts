import { useQuery, type QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';

import { actAsync } from '@test-utils/act';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useFocusNotifyOnChangeProps } from './useFocusNotifyOnChangeProps';

// Records the focus effect so tests can simulate focus and blur without a navigator.
let mockFocusEffect: (() => (() => void) | undefined) | undefined;

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useFocusEffect: (effect: () => (() => void) | undefined) => {
    mockFocusEffect = effect;
  },
}));

/** Query notifications are batched on a macrotask, so wait one before asserting. */
async function setAndFlush(client: QueryClient, value: number): Promise<void> {
  await act(async () => {
    client.setQueryData(['focus-notify'], value);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

describe('useFocusNotifyOnChangeProps', () => {
  it('passes the given props through while the screen is focused', async () => {
    const { result } = await renderHook(() => useFocusNotifyOnChangeProps(['data', 'error']));
    await actAsync(() => {
      mockFocusEffect?.();
    });

    expect(result.current()).toEqual(['data', 'error']);
  });

  it('defaults to undefined (tracked props) while focused', async () => {
    const { result } = await renderHook(() => useFocusNotifyOnChangeProps());

    expect(result.current()).toBeUndefined();
  });

  it('notifies nothing once the screen lost focus, and again after it is refocused', async () => {
    const { result } = await renderHook(() => useFocusNotifyOnChangeProps('all'));
    let blur: (() => void) | undefined;
    await actAsync(() => {
      blur = mockFocusEffect?.();
    });

    blur?.();
    expect(result.current()).toEqual([]);

    await actAsync(() => {
      mockFocusEffect?.();
    });
    expect(result.current()).toBe('all');
  });

  it('calls a function form of notifyOnChangeProps while focused', async () => {
    const notify = jest.fn(() => ['status' as const]);
    const { result } = await renderHook(() => useFocusNotifyOnChangeProps(notify));

    expect(result.current()).toEqual(['status']);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('keeps a query from re-rendering the blurred screen, and resumes on focus', async () => {
    let passes = 0;
    const { result, queryClient } = await renderHookWithProviders(() => {
      passes += 1;
      const notifyOnChangeProps = useFocusNotifyOnChangeProps(['data']);
      return useQuery({
        queryKey: ['focus-notify'],
        queryFn: () => 0,
        initialData: 0,
        staleTime: Infinity,
        notifyOnChangeProps,
      });
    });
    let blur: (() => void) | undefined;
    await actAsync(() => {
      blur = mockFocusEffect?.();
    });

    await setAndFlush(queryClient, 1);
    expect(result.current.data).toBe(1);

    blur?.();
    const passesBeforeBlurUpdate = passes;
    await setAndFlush(queryClient, 2);

    expect(result.current.data).toBe(1);
    expect(passes).toBe(passesBeforeBlurUpdate);

    await actAsync(() => {
      mockFocusEffect?.();
    });
    await setAndFlush(queryClient, 3);
    expect(result.current.data).toBe(3);
  });
});
