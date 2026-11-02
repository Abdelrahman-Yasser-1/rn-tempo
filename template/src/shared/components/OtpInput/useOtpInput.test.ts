import { act, renderHook } from '@testing-library/react-native';
import type { TextInputInstance } from 'react-native';

import { DEFAULT_LENGTH, useOtpInput } from './useOtpInput';

const LENGTH = 4;

type Params = Parameters<typeof useOtpInput>[0];

async function setup(overrides: Partial<Params> = {}) {
  const onChangeText = jest.fn();
  const onComplete = jest.fn();
  const view = await renderHook(() =>
    useOtpInput({ value: '', onChangeText, onComplete, length: LENGTH, ...overrides }),
  );
  return { ...view, onChangeText, onComplete };
}

/** Registers a fake cell with a focus spy at `index`. */
function attachCell(result: { current: ReturnType<typeof useOtpInput> }, index: number) {
  const focus = jest.fn();
  result.current.setCellRef(index, { focus } as unknown as TextInputInstance);
  return focus;
}

describe('useOtpInput', () => {
  test('exposes one cell index per digit and no focused cell', async () => {
    const { result } = await setup();

    expect(result.current.cells).toEqual([0, 1, 2, 3]);
    expect(result.current.focusedIndex).toBeNull();
    expect(DEFAULT_LENGTH).toBe(6);
  });

  test('typing a digit stores it and focuses the next cell', async () => {
    const { result, onChangeText, onComplete } = await setup();
    const focusNext = attachCell(result, 1);

    result.current.onCellChange(0, '7');

    expect(onChangeText).toHaveBeenCalledWith('7');
    expect(focusNext).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('non-digits are stripped; an empty result removes the digit at that cell', async () => {
    const { result, onChangeText } = await setup({ value: '123' });

    result.current.onCellChange(1, 'a');

    expect(onChangeText).toHaveBeenCalledWith('13');
  });

  test('a pasted code spreads from the cell, is capped at the length and completes', async () => {
    const { result, onChangeText, onComplete } = await setup();
    const focusLast = attachCell(result, LENGTH - 1);

    result.current.onCellChange(0, '12-34 56');

    expect(onChangeText).toHaveBeenCalledWith('1234');
    expect(onComplete).toHaveBeenCalledWith('1234');
    expect(focusLast).toHaveBeenCalledTimes(1);
  });

  test('completing by typing the last digit calls onComplete once', async () => {
    const { result, onComplete } = await setup({ value: '123' });

    result.current.onCellChange(3, '4');

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('1234');
  });

  test('a code without an onComplete handler still updates the text', async () => {
    const { result, onChangeText } = await setup({ onComplete: undefined, value: '123' });

    result.current.onCellChange(3, '4');

    expect(onChangeText).toHaveBeenCalledWith('1234');
  });

  test('backspace on an empty cell removes the previous digit and focuses it', async () => {
    const { result, onChangeText } = await setup({ value: '12' });
    const focusPrevious = attachCell(result, 1);

    result.current.onCellBackspace(2);

    expect(onChangeText).toHaveBeenCalledWith('1');
    expect(focusPrevious).toHaveBeenCalledTimes(1);
  });

  test('backspace on a filled cell or the first cell does nothing', async () => {
    const { result, onChangeText } = await setup({ value: '12' });

    result.current.onCellBackspace(1);
    result.current.onCellBackspace(0);

    expect(onChangeText).not.toHaveBeenCalled();
  });

  test('focus and blur track the focused cell, and a stale blur is ignored', async () => {
    const { result } = await setup();

    await act(() => {
      result.current.onCellFocus(2);
      return Promise.resolve();
    });
    expect(result.current.focusedIndex).toBe(2);

    await act(() => {
      result.current.onCellBlur(1);
      return Promise.resolve();
    });
    expect(result.current.focusedIndex).toBe(2);

    await act(() => {
      result.current.onCellBlur(2);
      return Promise.resolve();
    });
    expect(result.current.focusedIndex).toBeNull();
  });
});
