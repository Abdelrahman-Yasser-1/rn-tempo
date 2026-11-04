import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { TimeSlotPicker } from './TimeSlotPicker';

const SLOTS = [
  { value: '09:00' },
  { value: '10:00', disabled: true },
  { value: '13:00', label: 'One o clock' },
  { value: '18:30' },
];

describe('TimeSlotPicker', () => {
  it('shows the placeholder, then the chosen slot', async () => {
    const { rerender } = await renderWithProviders(
      <TimeSlotPicker label="Slot" slots={SLOTS} onChange={jest.fn()} />,
    );
    expect(screen.getByText('Select a time slot')).toBeOnTheScreen();
    await rerender(
      <TimeSlotPicker label="Slot" slots={SLOTS} value="13:00" onChange={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Slot' })).toHaveAccessibilityValue({
      text: 'One o clock',
    });
  });

  it('groups the slots by period and selects one', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <TimeSlotPicker label="Slot" slots={SLOTS} value="09:00" onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'Slot' }));
    expect(screen.getByRole('header', { name: 'Morning' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Afternoon' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Evening' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /9:00/ })).toBeSelected();
    expect(screen.getByRole('button', { name: /10:00/ })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'One o clock' }));
    expect(onChange).toHaveBeenCalledWith('13:00');
  });

  it('titles the sheet with the date', async () => {
    await renderWithProviders(
      <TimeSlotPicker label="Slot" slots={SLOTS} date="2026-11-18" onChange={jest.fn()} />,
    );
    expect(screen.getByRole('header', { name: 'Slots for Nov 18, 2026' })).toBeOnTheScreen();
  });

  it('shows an empty state without slots', async () => {
    await renderWithProviders(<TimeSlotPicker label="Slot" slots={[]} onChange={jest.fn()} />);
    expect(screen.getByText('No time slots')).toBeOnTheScreen();
  });
});
