import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { DatePicker } from './DatePicker';

describe('DatePicker', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the placeholder, then the formatted value', async () => {
    const { rerender } = await renderWithProviders(
      <DatePicker label="Date" onChange={jest.fn()} />,
    );
    expect(screen.getByText('Select a date')).toBeOnTheScreen();
    await rerender(<DatePicker label="Date" value="2026-11-04" onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Date' })).toHaveAccessibilityValue({
      text: 'Nov 4, 2026',
    });
  });

  it('uses a custom formatter', async () => {
    await renderWithProviders(
      <DatePicker
        label="Date"
        value="2026-11-04"
        formatValue={(iso) => `on ${iso}`}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText('on 2026-11-04')).toBeOnTheScreen();
  });

  it('opens the sheet and reports the confirmed day', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <DatePicker label="Date" initialMonth="2026-11" onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'Date' }));
    expect(present).toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Wednesday, November 18, 2026' }));
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(onChange).toHaveBeenCalledWith('2026-11-18');
  });
});
