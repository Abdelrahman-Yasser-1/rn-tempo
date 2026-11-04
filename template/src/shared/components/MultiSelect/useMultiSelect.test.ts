import { act, renderHook } from '@testing-library/react-native';

import type { MultiSelectOption } from './types';
import { useMultiSelect } from './useMultiSelect';

const OPTIONS: readonly MultiSelectOption[] = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta', disabled: true },
  { value: 'c', label: 'Gamma' },
];

async function setup(value: string[], maxSelected?: number) {
  const onChange = jest.fn();
  const view = await renderHook(() =>
    useMultiSelect({ options: OPTIONS, value, onChange, maxSelected }),
  );
  return { ...view, onChange };
}

describe('useMultiSelect', () => {
  test('lists the selected options in option order', async () => {
    const { result } = await setup(['c', 'a']);

    expect(result.current.selectedOptions.map((option) => option.value)).toEqual(['a', 'c']);
    expect(result.current.hasSelection).toBe(true);
  });

  test('toggles values on and off', async () => {
    const { result, onChange } = await setup(['a']);

    result.current.onToggle('c');
    expect(onChange).toHaveBeenLastCalledWith(['a', 'c']);
    result.current.onToggle('a');
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  test('refuses a new value at the limit but still allows removing', async () => {
    const { result, onChange } = await setup(['a'], 1);

    result.current.onToggle('c');
    expect(onChange).not.toHaveBeenCalled();
    result.current.onToggle('a');
    expect(onChange).toHaveBeenCalledWith([]);
    expect(result.current.isMaxReached).toBe(true);
    expect(result.current.canSelectAll).toBe(false);
  });

  test('select all skips disabled options and keeps the current selection', async () => {
    const { result, onChange } = await setup(['c']);

    result.current.onSelectAll();

    expect(onChange).toHaveBeenCalledWith(['c', 'a']);
  });

  test('clear and remove', async () => {
    const { result, onChange } = await setup(['a', 'c']);

    result.current.onRemove('a');
    expect(onChange).toHaveBeenLastCalledWith(['c']);
    result.current.onClear();
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  test('shows chips for up to three selections only', async () => {
    const { result: few } = await setup(['a', 'b', 'c']);

    expect(few.current.hasInlineChips).toBe(true);
  });

  test('collapses the chips from the fourth selection on', async () => {
    const { result } = await renderHook(() =>
      useMultiSelect({
        options: [...OPTIONS, { value: 'd', label: 'Delta' }],
        value: ['a', 'b', 'c', 'd'],
        onChange: jest.fn(),
      }),
    );

    expect(result.current.hasInlineChips).toBe(false);
  });

  test('ignores values that are not options', async () => {
    const { result } = await setup(['zzz', 'a']);

    expect(result.current.selectedOptions.map((option) => option.value)).toEqual(['a']);
  });

  test('onOpen presents the sheet; onClose dismisses it; onDismiss resets the search', async () => {
    const { result } = await setup([]);
    const sheet = { present: jest.fn(), dismiss: jest.fn() };
    result.current.sheetRef.current = sheet as never;

    await act(() => {
      result.current.onOpen();
      result.current.onSearchChange('alp');
      return Promise.resolve();
    });
    expect(result.current.isOpen).toBe(true);
    expect(sheet.present).toHaveBeenCalledTimes(1);
    result.current.onClose();
    expect(sheet.dismiss).toHaveBeenCalledTimes(1);
    await act(() => {
      result.current.onDismiss();
      return Promise.resolve();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.search).toBe('');
  });

  describe('search', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    test('filters by label and description once the debounce has passed', async () => {
      const onChange = jest.fn();
      const { result } = await renderHook(() =>
        useMultiSelect({
          options: [{ value: 'x', label: 'Xylophone', description: 'Percussion' }, ...OPTIONS],
          value: [],
          onChange,
        }),
      );

      await act(() => {
        result.current.onSearchChange('  PERCUSS ');
        return Promise.resolve();
      });
      expect(result.current.visibleOptions).toHaveLength(4);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(250);
      });

      expect(result.current.visibleOptions.map((option) => option.value)).toEqual(['x']);
    });

    test('select all only takes the options the search leaves', async () => {
      const { result, onChange } = await setup([]);

      await act(() => {
        result.current.onSearchChange('gam');
        return Promise.resolve();
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(250);
      });
      result.current.onSelectAll();

      expect(onChange).toHaveBeenCalledWith(['c']);
    });
  });
});
