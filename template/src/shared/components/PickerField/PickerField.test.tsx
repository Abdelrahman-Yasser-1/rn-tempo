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

  it('is a button that reports whether its picker is open', async () => {
    const { rerender } = await renderWithProviders(
      <PickerField label="Date" placeholder="Select" icon="calendar" onPress={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Date', expanded: false })).toBeOnTheScreen();
    await rerender(
      <PickerField label="Date" placeholder="Select" icon="calendar" open onPress={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Date', expanded: true })).toBeOnTheScreen();
  });

  it('does not open when disabled and reports the disabled state', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <PickerField label="Date" placeholder="Select" icon="calendar" disabled onPress={onPress} />,
    );
    const field = screen.getByRole('button', { name: 'Date' });
    expect(field).toBeDisabled();
    await user.press(field);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('still shows the value of a read-only field', async () => {
    await renderWithProviders(
      <PickerField
        readOnly
        label="Date"
        placeholder="Select"
        valueText="Nov 4, 2026"
        icon="calendar"
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('Nov 4, 2026')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Date' })).toBeEnabled();
  });

  it('shows the helper text, and the error instead of it once invalid', async () => {
    const { rerender } = await renderWithProviders(
      <PickerField
        label="Date"
        placeholder="Select"
        icon="calendar"
        helperText="Any day"
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('Any day')).toBeOnTheScreen();
    await rerender(
      <PickerField
        label="Date"
        placeholder="Select"
        icon="calendar"
        helperText="Any day"
        errorText="Pick a date."
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('Pick a date.')).toBeOnTheScreen();
    expect(screen.queryByText('Any day')).not.toBeOnTheScreen();
  });

  it('marks the label as required', async () => {
    await renderWithProviders(
      <PickerField
        required
        label="Date"
        placeholder="Select"
        icon="calendar"
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('*')).toBeOnTheScreen();
  });
});
