import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { PickerField } from './PickerField';

describe('PickerField', () => {
  it('shows the placeholder, then the value', async () => {
    const { rerender } = await renderWithProviders(
      <PickerField label="Date" placeholder="Select a date" icon="calendar" onPress={jest.fn()} />,
    );
    expect(screen.getByText('Select a date')).toBeOnTheScreen();
    await rerender(
      <PickerField
        label="Date"
        placeholder="Select a date"
        valueText="Nov 4, 2026"
        icon="calendar"
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Date' })).toHaveAccessibilityValue({
      text: 'Nov 4, 2026',
    });
  });

  it('opens on press unless read-only or disabled', async () => {
    const onPress = jest.fn();
    const { user, rerender } = await renderWithProviders(
      <PickerField label="Date" placeholder="Select" icon="calendar" onPress={onPress} />,
    );
    await user.press(screen.getByRole('button', { name: 'Date' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    await rerender(
      <PickerField label="Date" placeholder="Select" icon="calendar" readOnly onPress={onPress} />,
    );
    await user.press(screen.getByRole('button', { name: 'Date' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows the error message', async () => {
    await renderWithProviders(
      <PickerField
        label="Date"
        placeholder="Select"
        icon="calendar"
        errorText="Pick a date."
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('Pick a date.')).toBeOnTheScreen();
  });
});
