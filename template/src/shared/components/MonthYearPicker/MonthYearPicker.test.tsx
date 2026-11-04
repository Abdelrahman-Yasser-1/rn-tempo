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

  it('discards the draft on Cancel and reopens on the committed month', async () => {
    jest.spyOn(BottomSheetModal.prototype, 'dismiss').mockImplementation(function dismiss(this: {
      props: { onDismiss?: () => void };
    }) {
      this.props.onDismiss?.();
    });
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <MonthYearPicker label="Month" value="2026-11" onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'Month' }));
    await user.press(screen.getByRole('button', { name: 'March 2026' }));
    expect(screen.getByRole('button', { name: 'March 2026' })).toBeSelected();
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Month', expanded: false })).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Month' }));
    expect(screen.getByRole('button', { name: 'November 2026' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'March 2026' })).not.toBeSelected();
  });

  it('commits a month of another year', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <MonthYearPicker label="Month" value="2026-11" onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'Month' }));
    await user.press(screen.getByRole('button', { name: '2027' }));
    await user.press(screen.getByRole('button', { name: 'February 2027' }));
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(onChange).toHaveBeenCalledWith('2027-02');
  });

  it('disables the months outside minMonth and maxMonth', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <MonthYearPicker
        label="Month"
        value="2026-11"
        minMonth="2026-03"
        maxMonth="2026-12"
        onChange={onChange}
      />,
    );
    await user.press(screen.getByRole('button', { name: 'Month' }));
    expect(screen.getByRole('button', { name: 'February 2026' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'March 2026' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'December 2026' })).toBeEnabled();
    await user.press(screen.getByRole('button', { name: 'February 2026' }));
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    // The disabled month was never drafted, so the committed draft is still the value.
    expect(onChange).toHaveBeenCalledWith('2026-11');
  });

  it('uses a custom formatter and the given sheet title', async () => {
    await renderWithProviders(
      <MonthYearPicker
        label="Month"
        value="2026-11"
        sheetTitle="Statement"
        formatValue={(month, locale) => `${month}/${locale}`}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText('2026-11/en')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Statement' })).toBeOnTheScreen();
  });

  it('titles the sheet with the label, then the default', async () => {
    const { rerender } = await renderWithProviders(
      <MonthYearPicker label="Month" onChange={jest.fn()} />,
    );
    expect(screen.getByRole('header', { name: 'Month' })).toBeOnTheScreen();
    await rerender(<MonthYearPicker onChange={jest.fn()} />);
    expect(screen.getByRole('header', { name: 'Select month and year' })).toBeOnTheScreen();
  });

  it('formats the month in Arabic with Latin digits', async () => {
    await renderWithProviders(
      <MonthYearPicker label="الشهر" value="2026-11" onChange={jest.fn()} />,
      {
        language: 'ar',
      },
    );
    expect(screen.getByRole('button', { name: 'الشهر' })).toHaveAccessibilityValue({
      text: 'نوفمبر 2026',
    });
  });

  it('does not open when disabled or read-only', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    const { user, rerender } = await renderWithProviders(
      <MonthYearPicker disabled label="Month" onChange={jest.fn()} />,
    );
    await user.press(screen.getByRole('button', { name: 'Month' }));
    await rerender(<MonthYearPicker readOnly label="Month" onChange={jest.fn()} />);
    await user.press(screen.getByRole('button', { name: 'Month' }));
    expect(present).not.toHaveBeenCalled();
  });
});
