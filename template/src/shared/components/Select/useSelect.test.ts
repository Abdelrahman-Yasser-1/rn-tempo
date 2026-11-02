import { act, renderHook } from '@testing-library/react-native';

import type { SelectOption } from './types';
import { useSelect } from './useSelect';

const OPTIONS: readonly SelectOption[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
];

/** Renders the hook with a fake bottom sheet attached to its ref. */
async function setup(value?: string) {
  const onChange = jest.fn();
  const sheet = { present: jest.fn(), dismiss: jest.fn() };
  const view = await renderHook(() => useSelect({ options: OPTIONS, value, onChange }));
  view.result.current.sheetRef.current = sheet as never;
  return { ...view, onChange, sheet };
}

describe('useSelect', () => {
  test('resolves the selected option from the value', async () => {
    const { result } = await setup('b');

    expect(result.current.selected).toEqual(OPTIONS[1]);
    expect(result.current.isOpen).toBe(false);
  });

  test('has no selected option for an unknown or missing value', async () => {
    const { result: missing } = await setup();
    const { result: unknown } = await setup('zzz');

    expect(missing.current.selected).toBeUndefined();
    expect(unknown.current.selected).toBeUndefined();
  });

  test('onOpen presents the sheet and marks the select open', async () => {
    const { result, sheet } = await setup();

    await act(() => {
      result.current.onOpen();
      return Promise.resolve();
    });

    expect(result.current.isOpen).toBe(true);
    expect(sheet.present).toHaveBeenCalledTimes(1);
  });

  test('onDismiss marks the select closed', async () => {
    const { result } = await setup();
    await act(() => {
      result.current.onOpen();
      return Promise.resolve();
    });

    await act(() => {
      result.current.onDismiss();
      return Promise.resolve();
    });

    expect(result.current.isOpen).toBe(false);
  });

  test('onClose dismisses the sheet', async () => {
    const { result, sheet } = await setup();

    result.current.onClose();

    expect(sheet.dismiss).toHaveBeenCalledTimes(1);
  });

  test('onSelect reports the value and dismisses the sheet', async () => {
    const { result, onChange, sheet } = await setup('a');

    result.current.onSelect('b');

    expect(onChange).toHaveBeenCalledWith('b');
    expect(sheet.dismiss).toHaveBeenCalledTimes(1);
  });

  test('actions are safe before the sheet is attached', async () => {
    const onChange = jest.fn();
    const { result } = await renderHook(() =>
      useSelect({ options: OPTIONS, value: undefined, onChange }),
    );

    await act(() => {
      result.current.onOpen();
      result.current.onClose();
      result.current.onSelect('a');
      return Promise.resolve();
    });

    expect(onChange).toHaveBeenCalledWith('a');
  });
});
