import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useTimeSlotPicker } from './useTimeSlotPicker';

const BOUNDARIES = ['11:59', '12:00', '16:59', '17:00'].map((value) => ({ value }));

async function setup(slots = BOUNDARIES) {
  return renderHookWithProviders(() => useTimeSlotPicker({ slots, onChange: jest.fn() }));
}

describe('useTimeSlotPicker', () => {
  it('groups the slots at the 12:00 and 17:00 boundaries', async () => {
    const { result } = await setup();
    expect(
      result.current.groups.map((group) => [group.period, group.slots.map((slot) => slot.value)]),
    ).toEqual([
      ['morning', ['11:59']],
      ['afternoon', ['12:00', '16:59']],
      ['evening', ['17:00']],
    ]);
  });

  it('keeps the periods in day order whatever the slot order', async () => {
    const { result } = await setup([{ value: '18:00' }, { value: '08:00' }]);
    expect(result.current.groups.map((group) => group.period)).toEqual(['morning', 'evening']);
  });

  it('has no groups and no slots when the list is empty', async () => {
    const { result } = await setup([]);
    expect(result.current.groups).toEqual([]);
    expect(result.current.hasSlots).toBe(false);
  });

  it('uses the slot label, else the formatted time', async () => {
    const { result } = await setup();
    expect(result.current.slotText({ value: '09:00', label: 'Nine' })).toBe('Nine');
    expect(result.current.slotText({ value: '09:00' })).toMatch(/^9:00\sAM$/);
  });
});
