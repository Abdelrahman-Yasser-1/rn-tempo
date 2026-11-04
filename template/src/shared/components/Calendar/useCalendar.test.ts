import { act } from '@testing-library/react-native';

import { addDays, toISODate } from '@shared/utils/calendar';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import type { CalendarProps } from './types';
import { useCalendar } from './useCalendar';

async function setup(props: Partial<CalendarProps>) {
  return renderHookWithProviders(() => useCalendar({ onChange: jest.fn(), ...props }));
}

describe('useCalendar', () => {
  it('opens on the initial month with six weeks and Sunday first in English', async () => {
    const { result } = await setup({ initialMonth: '2026-11' });
    expect(result.current.title).toBe('November 2026');
    expect(result.current.weeks).toHaveLength(6);
    expect(result.current.weeks[0]?.[0]?.iso).toBe('2026-11-01');
  });

  it('steps the month across the year boundary', async () => {
    const { result } = await setup({ initialMonth: '2026-12' });
    await act(() => {
      result.current.onNext();
    });
    expect(result.current.title).toBe('January 2027');
    await act(() => {
      result.current.onPrevious();
    });
    await act(() => {
      result.current.onPrevious();
    });
    expect(result.current.title).toBe('November 2026');
  });

  it('opens on the value month, clamped into the bounds', async () => {
    const { result } = await setup({ value: '2026-01-10', minDate: '2026-03-05' });
    expect(result.current.title).toBe('March 2026');
    expect(result.current.canGoPrevious).toBe(false);
    expect(result.current.canGoNext).toBe(true);
  });

  it('flags only today, only the value and the disabled days on the cells', async () => {
    const today = toISODate(new Date());
    const { result } = await setup({
      initialMonth: today,
      value: today,
      isDateDisabled: (iso) => iso === addDays(today, 1),
    });
    const cells = result.current.weeks.flat();
    expect(cells.filter((cell) => cell.isToday).map((cell) => cell.iso)).toEqual([today]);
    expect(cells.filter((cell) => cell.isSelected).map((cell) => cell.iso)).toEqual([today]);
    expect(cells.filter((cell) => cell.isDisabled).map((cell) => cell.iso)).toEqual([
      addDays(today, 1),
    ]);
  });

  it('orders the weekday header from the first day and keeps the keys unique', async () => {
    const { result: sundayFirst } = await setup({ initialMonth: '2026-11' });
    expect(sundayFirst.current.weekdays.map((day) => day.label).join('')).toBe('SMTWTFS');
    const { result: mondayFirst } = await setup({ initialMonth: '2026-11', firstDayOfWeek: 1 });
    expect(mondayFirst.current.weekdays.map((day) => day.label).join('')).toBe('MTWTFSS');
    expect(mondayFirst.current.weeks[0]?.[0]?.iso).toBe('2026-10-26');
    const keys = mondayFirst.current.weekdays.map((day) => day.key);
    expect(new Set(keys).size).toBe(7);
  });

  it('starts on Saturday in Arabic, with Latin digits and Arabic names', async () => {
    const { result } = await renderHookWithProviders(
      () => useCalendar({ onChange: jest.fn(), initialMonth: '2026-11' }),
      { language: 'ar' },
    );
    expect(result.current.title).toBe('نوفمبر 2026');
    expect(result.current.weeks[0]?.[0]?.iso).toBe('2026-10-31');
    expect(result.current.weekdays.map((day) => day.label)).toEqual([
      'س',
      'ح',
      'ن',
      'ث',
      'ر',
      'خ',
      'ج',
    ]);
    const eighteenth = result.current.weeks.flat().find((cell) => cell.iso === '2026-11-18');
    expect(eighteenth?.label).toBe('18');
    expect(eighteenth?.accessibilityLabel).toBe('الأربعاء، 18 نوفمبر 2026');
  });

  it('limits stepping by the month of minDate and maxDate', async () => {
    const { result } = await setup({
      initialMonth: '2026-11',
      minDate: '2026-10-15',
      maxDate: '2026-12-15',
    });
    expect(result.current.canGoPrevious).toBe(true);
    expect(result.current.canGoNext).toBe(true);
    expect(result.current.minMonth).toBe('2026-10');
    expect(result.current.maxMonth).toBe('2026-12');
    await act(() => {
      result.current.onNext();
    });
    expect(result.current.canGoNext).toBe(false);
  });

  it('toggles the month grid and returns to the days on a pick', async () => {
    const { result } = await setup({ initialMonth: '2026-11' });
    await act(() => {
      result.current.onToggleMonthPicker();
    });
    expect(result.current.isPickingMonth).toBe(true);
    await act(() => {
      result.current.onPickMonth(2027, 1);
    });
    expect(result.current.isPickingMonth).toBe(false);
    expect(result.current.title).toBe('February 2027');
  });

  it('applies renderDayLabel to the label only', async () => {
    const { result } = await setup({
      initialMonth: '2026-11',
      renderDayLabel: (_iso, label) => `x${label}`,
    });
    const cell = result.current.weeks.flat().find((entry) => entry.iso === '2026-11-18');
    expect(cell?.label).toBe('x18');
    expect(cell?.accessibilityLabel).toBe('Wednesday, November 18, 2026');
  });

  it('forwards a selection to onChange', async () => {
    const onChange = jest.fn();
    const { result } = await setup({ initialMonth: '2026-11', onChange });
    result.current.onSelect('2026-11-18');
    expect(onChange).toHaveBeenCalledWith('2026-11-18');
  });
});
