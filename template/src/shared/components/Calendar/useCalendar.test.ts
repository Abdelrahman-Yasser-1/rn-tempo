import { act } from '@testing-library/react-native';

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
});
