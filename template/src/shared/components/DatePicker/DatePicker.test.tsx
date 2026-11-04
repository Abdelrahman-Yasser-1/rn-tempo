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

  it('formats the value in Arabic with Latin digits', async () => {
    await renderWithProviders(
      <DatePicker label="التاريخ" value="2026-11-04" onChange={jest.fn()} />,
      {
        language: 'ar',
      },
    );
    const value = screen.getByRole('button', { name: 'التاريخ' }).props.accessibilityValue as {
      text: string;
    };
    expect(value.text).toMatch(/^04\W+11\W+2026$/);
  });

  it('passes the locale to a custom formatter', async () => {
    const formatValue = jest.fn((iso: string, locale: string) => `${iso}@${locale}`);
    await renderWithProviders(
      <DatePicker label="Date" value="2026-11-04" formatValue={formatValue} onChange={jest.fn()} />,
    );
    expect(screen.getByText('2026-11-04@en')).toBeOnTheScreen();
  });

  it('does not call onChange until Confirm, and not at all on Cancel', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <DatePicker label="Date" initialMonth="2026-11" onChange={onChange} />,
    );
    await user.press(screen.getByRole('button', { name: 'Date' }));
    await user.press(screen.getByRole('button', { name: 'Wednesday, November 18, 2026' }));
    expect(onChange).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports open state and closes after the sheet is dismissed', async () => {
    jest.spyOn(BottomSheetModal.prototype, 'dismiss').mockImplementation(function dismiss(this: {
      props: { onDismiss?: () => void };
    }) {
      this.props.onDismiss?.();
    });
    const { user } = await renderWithProviders(
      <DatePicker label="Date" initialMonth="2026-11" onChange={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Date', expanded: false })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Date' }));
    expect(screen.getByRole('button', { name: 'Date', expanded: true })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Date', expanded: false })).toBeOnTheScreen();
  });

  it('does not open when disabled or read-only', async () => {
    const present = jest.spyOn(BottomSheetModal.prototype, 'present');
    const { user, rerender } = await renderWithProviders(
      <DatePicker disabled label="Date" onChange={jest.fn()} />,
    );
    await user.press(screen.getByRole('button', { name: 'Date' }));
    await rerender(<DatePicker readOnly label="Date" onChange={jest.fn()} />);
    await user.press(screen.getByRole('button', { name: 'Date' }));
    expect(present).not.toHaveBeenCalled();
  });

  it('forwards the calendar props and the sheet title', async () => {
    const { user } = await renderWithProviders(
      <DatePicker
        label="Date"
        sheetTitle="Pick a day"
        initialMonth="2026-11"
        minDate="2026-11-10"
        onChange={jest.fn()}
      />,
    );
    await user.press(screen.getByRole('button', { name: 'Date' }));
    expect(screen.getByRole('header', { name: 'Pick a day' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Monday, November 9, 2026' })).toBeDisabled();
  });

  it('shows the error text', async () => {
    await renderWithProviders(
      <DatePicker label="Date" errorText="Enter a valid date." onChange={jest.fn()} />,
    );
    expect(screen.getByText('Enter a valid date.')).toBeOnTheScreen();
  });
});
