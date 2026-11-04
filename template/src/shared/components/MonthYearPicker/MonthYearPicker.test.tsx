import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { MonthYearPicker } from './MonthYearPicker';

describe('MonthYearPicker', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the placeholder, then the formatted month', async () => {
    const { rerender } = await renderWithProviders(
      <MonthYearPicker label="Month" onChange={jest.fn()} />,
    );
    expect(screen.getByText('Select month and year')).toBeOnTheScreen();
    await rerender(<MonthYearPicker label="Month" value="2026-11" onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Month' })).toHaveAccessibilityValue({
      text: 'November 2026',
    });
  });

  it('opens the sheet and reports the confirmed month', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <MonthYearPicker label="Month" value="2026-11" onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'Month' }));
    expect(present).toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'March 2026' }));
    expect(onChange).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(onChange).toHaveBeenCalledWith('2026-03');
  });

  it('disables Confirm until a month is drafted', async () => {
    const { user } = await renderWithProviders(
      <MonthYearPicker label="Month" onChange={jest.fn()} />,
    );
    await user.press(screen.getByRole('button', { name: 'Month' }));
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });
});
