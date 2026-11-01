import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { screen, within } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Select } from './Select';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma', disabled: true },
];

describe('Select', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is a combobox named by its label, exposing the selected option', async () => {
    await renderWithProviders(
      <Select label="Plan" options={OPTIONS} value="b" onChange={jest.fn()} />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Plan' });
    expect(trigger).toHaveAccessibilityValue({ text: 'Beta' });
    // The option list is also rendered (the sheet mock is always mounted), so scope to the trigger.
    expect(within(trigger).getByText('Beta')).toBeOnTheScreen();
  });

  it('shows the placeholder when nothing is selected', async () => {
    await renderWithProviders(
      <Select label="Plan" options={OPTIONS} value={undefined} onChange={jest.fn()} />,
    );
    expect(screen.getByText('Select an option')).toBeOnTheScreen();
  });

  it('uses a custom placeholder when given', async () => {
    await renderWithProviders(
      <Select
        label="Plan"
        placeholder="Pick a plan"
        options={OPTIONS}
        value={undefined}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText('Pick a plan')).toBeOnTheScreen();
  });

  it('opens the option sheet when the trigger is pressed', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    const { user } = await renderWithProviders(
      <Select label="Plan" options={OPTIONS} value={undefined} onChange={jest.fn()} />,
    );
    await user.press(screen.getByRole('combobox', { name: 'Plan' }));
    expect(present).toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: 'Plan' })).toBeExpanded();
  });

  it('reports the chosen option and dismisses the sheet', async () => {
    const onChange = jest.fn();
    const dismiss = jest.spyOn(BottomSheetModal.prototype, 'dismiss');
    const { user } = await renderWithProviders(
      <Select label="Plan" options={OPTIONS} value="a" onChange={onChange} />,
    );
    await user.press(screen.getByRole('radio', { name: 'Beta' }));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(dismiss).toHaveBeenCalled();
  });

  it('does not select disabled options', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <Select label="Plan" options={OPTIONS} value="a" onChange={onChange} />,
    );
    const gamma = screen.getByRole('radio', { name: 'Gamma' });
    expect(gamma).toBeDisabled();
    await user.press(gamma);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows an announced error in place of the helper text', async () => {
    await renderWithProviders(
      <Select
        label="Plan"
        options={OPTIONS}
        value={undefined}
        helperText="Choose one"
        errorText="Plan is required"
        onChange={jest.fn()}
      />,
    );
    expect(screen.queryByText('Choose one')).not.toBeOnTheScreen();
    expect(screen.getByRole('alert', { name: 'Plan is required' })).toBeOnTheScreen();
  });

  it('is disabled when disabled', async () => {
    await renderWithProviders(
      <Select label="Plan" options={OPTIONS} value={undefined} disabled onChange={jest.fn()} />,
    );
    expect(screen.getByRole('combobox', { name: 'Plan' })).toBeDisabled();
  });
});
