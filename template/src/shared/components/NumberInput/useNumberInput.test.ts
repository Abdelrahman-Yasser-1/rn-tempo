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

  test('keeps digits only while typing and clamps the draft on end', async () => {
    const { result, onChange } = await setup(4, { min: 2, max: 8 });
    await act(() => {
      result.current.onFocus();
      return Promise.resolve();
    });
    expect(result.current.isFocused).toBe(true);
    await act(() => {
      result.current.onChangeText('9x9');
      return Promise.resolve();
    });
    expect(result.current.text).toBe('99');
    await act(() => {
      result.current.onEndEditing();
      return Promise.resolve();
    });

    expect(onChange).toHaveBeenCalledWith(8);
    expect(result.current.isFocused).toBe(false);
  });

  test('raises a typed value below the minimum to the minimum', async () => {
    const { result, onChange } = await setup(6, { min: 3 });
    await act(() => {
      result.current.onFocus();
      result.current.onChangeText('1');
      return Promise.resolve();
    });
    await act(() => {
      result.current.onEndEditing();
      return Promise.resolve();
    });

    expect(onChange).toHaveBeenCalledWith(3);
  });

  test('formats the value only while the field is not being edited', async () => {
    const onChange = jest.fn();
    const { result } = await renderHook(() =>
      useNumberInput({
        value: 5,
        onChange,
        min: 0,
        max: 10,
        step: 1,
        formatValue: (value) => `${String(value)} kg`,
      }),
    );
    expect(result.current.text).toBe('5 kg');
    await act(() => {
      result.current.onFocus();
      return Promise.resolve();
    });

    expect(result.current.text).toBe('5');
  });

  test('can step both ways between the bounds and not past them', async () => {
    const { result: middle } = await setup(5);
    const { result: bottom } = await setup(0);

    expect(middle.current.canDecrement).toBe(true);
    expect(middle.current.canIncrement).toBe(true);
    expect(bottom.current.canDecrement).toBe(false);
  });

  test('brings a value outside the range back inside on the next step', async () => {
    const { result, onChange } = await setup(0, { min: 1 });

    result.current.onIncrement();

    expect(onChange).toHaveBeenCalledWith(1);
  });
});
