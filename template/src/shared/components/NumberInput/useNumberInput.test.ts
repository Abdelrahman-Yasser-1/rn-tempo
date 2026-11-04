import { act, renderHook } from '@testing-library/react-native';

import { useNumberInput } from './useNumberInput';

async function setup(value: number, extra: { min?: number; max?: number; step?: number } = {}) {
  const onChange = jest.fn();
  const view = await renderHook(() =>
    useNumberInput({ value, onChange, min: 0, max: 10, step: 1, ...extra }),
  );
  return { ...view, onChange };
}

describe('useNumberInput', () => {
  test('steps and stays inside the bounds', async () => {
    const { result, onChange } = await setup(9, { step: 5 });

    result.current.onIncrement();
    expect(onChange).toHaveBeenLastCalledWith(10);
    result.current.onDecrement();
    expect(onChange).toHaveBeenLastCalledWith(4);
  });

  test('does not report a value that did not change', async () => {
    const { result, onChange } = await setup(10);

    result.current.onIncrement();

    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.canIncrement).toBe(false);
    expect(result.current.canDecrement).toBe(true);
  });

  test('keeps the old value when the field is emptied', async () => {
    const { result, onChange } = await setup(4);
    await act(() => {
      result.current.onFocus();
      return Promise.resolve();
    });
    await act(() => {
      result.current.onChangeText('');
      return Promise.resolve();
    });
    await act(() => {
      result.current.onEndEditing();
      return Promise.resolve();
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.text).toBe('4');
  });
});
