import { renderHook } from '@testing-library/react-native';

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
});
