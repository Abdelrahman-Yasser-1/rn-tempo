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

  it('closes the sheet and commits when a slot is picked', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <TimeSlotPicker label="Slot" slots={SLOTS} onChange={onChange} />,
    );
    expect(screen.getByRole('button', { name: 'Slot', expanded: false })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Slot' }));
    expect(screen.getByRole('button', { name: 'Slot', expanded: true })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: /9:00/ }));
    expect(onChange).toHaveBeenCalledWith('09:00');
    expect(screen.getByRole('button', { name: 'Slot', expanded: false })).toBeOnTheScreen();
  });

  it('does not pick a disabled slot', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <TimeSlotPicker label="Slot" slots={SLOTS} onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'Slot' }));
    await user.press(screen.getByRole('button', { name: /10:00/ }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Slot', expanded: true })).toBeOnTheScreen();
  });

  it('leaves out the periods that have no slots', async () => {
    const { user } = await renderWithProviders(
      <TimeSlotPicker label="Slot" slots={[{ value: '09:00' }]} onChange={jest.fn()} />,
    );
    await user.press(screen.getByRole('button', { name: 'Slot' }));
    expect(screen.getByRole('header', { name: 'Morning' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Afternoon' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Evening' })).not.toBeOnTheScreen();
  });

  it('shows a value that is not among the slots as a time', async () => {
    await renderWithProviders(
      <TimeSlotPicker label="Slot" slots={SLOTS} value="15:45" onChange={jest.fn()} />,
    );
    expect(screen.getByText(/^3:45\sPM$/)).toBeOnTheScreen();
  });

  it('lets sheetTitle override the date title, and falls back to the label', async () => {
    const { rerender } = await renderWithProviders(
      <TimeSlotPicker
        label="Slot"
        slots={SLOTS}
        date="2026-11-18"
        sheetTitle="Choose"
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole('header', { name: 'Choose' })).toBeOnTheScreen();
    await rerender(<TimeSlotPicker label="Slot" slots={SLOTS} onChange={jest.fn()} />);
    expect(screen.getByRole('header', { name: 'Slot' })).toBeOnTheScreen();
    await rerender(<TimeSlotPicker slots={SLOTS} onChange={jest.fn()} />);
    expect(screen.getByRole('header', { name: 'Select a time slot' })).toBeOnTheScreen();
  });

  it('does not open when disabled or read-only', async () => {
    const { user, rerender } = await renderWithProviders(
      <TimeSlotPicker disabled label="Slot" slots={SLOTS} onChange={jest.fn()} />,
    );
    await user.press(screen.getByRole('button', { name: 'Slot' }));
    expect(screen.getByRole('button', { name: 'Slot', expanded: false })).toBeOnTheScreen();
    await rerender(<TimeSlotPicker readOnly label="Slot" slots={SLOTS} onChange={jest.fn()} />);
    await user.press(screen.getByRole('button', { name: 'Slot' }));
    expect(screen.getByRole('button', { name: 'Slot', expanded: false })).toBeOnTheScreen();
  });

  it('shows Arabic period names and Latin digits', async () => {
    await renderWithProviders(
      <TimeSlotPicker
        label="الموعد"
        slots={[{ value: '09:00' }]}
        date="2026-11-18"
        onChange={jest.fn()}
      />,
      { language: 'ar' },
    );
    expect(screen.getByRole('header', { name: 'الصباح' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^9:00/ })).toBeOnTheScreen();
  });
});
