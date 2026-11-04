import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { DatePickerSheet } from './DatePickerSheet';

describe('DatePickerSheet', () => {
  it('commits the drafted day only on Confirm', async () => {
    const onConfirm = jest.fn();
    const { user } = await renderWithProviders(
      <DatePickerSheet
        visible
        initialMonth="2026-11"
        value="2026-11-04"
        onConfirm={onConfirm}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByRole('header', { name: 'Select a date' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Wednesday, November 18, 2026' }));
    expect(onConfirm).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledWith('2026-11-18');
  });

  it('disables Confirm until a day is drafted', async () => {
    const { user } = await renderWithProviders(
      <DatePickerSheet visible initialMonth="2026-11" onConfirm={jest.fn()} onClose={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
    await user.press(screen.getByRole('button', { name: 'Wednesday, November 18, 2026' }));
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled();
  });

  it('discards the draft on Cancel and reopens on the committed value', async () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    const { user, rerender } = await renderWithProviders(
      <DatePickerSheet
        visible
        initialMonth="2026-11"
        value="2026-11-04"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    await user.press(screen.getByRole('button', { name: 'Wednesday, November 18, 2026' }));
    expect(screen.getByRole('button', { name: 'Wednesday, November 18, 2026' })).toBeSelected();
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();

    const element = (isVisible: boolean) => (
      <DatePickerSheet
        visible={isVisible}
        initialMonth="2026-11"
        value="2026-11-04"
        onConfirm={onConfirm}
        onClose={onClose}
      />
    );
    await rerender(element(false));
    await rerender(element(true));
    expect(screen.getByRole('button', { name: 'Wednesday, November 18, 2026' })).not.toBeSelected();
    expect(screen.getByRole('button', { name: 'Wednesday, November 4, 2026' })).toBeSelected();
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledWith('2026-11-04');
  });

  it('reopens on the value month after browsing elsewhere', async () => {
    const element = (isVisible: boolean) => (
      <DatePickerSheet
        visible={isVisible}
        value="2026-11-04"
        onConfirm={jest.fn()}
        onClose={jest.fn()}
      />
    );
    const { user, rerender } = await renderWithProviders(element(true));
    await user.press(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('button', { name: 'December 2026' })).toBeOnTheScreen();
    await rerender(element(false));
    await rerender(element(true));
    expect(screen.getByRole('button', { name: 'November 2026' })).toBeOnTheScreen();
  });

  it('takes the draft from a new value when it reopens', async () => {
    const element = (isVisible: boolean, value: string) => (
      <DatePickerSheet
        visible={isVisible}
        initialMonth="2026-11"
        value={value}
        onConfirm={jest.fn()}
        onClose={jest.fn()}
      />
    );
    const { rerender } = await renderWithProviders(element(true, '2026-11-04'));
    await rerender(element(false, '2026-11-09'));
    await rerender(element(true, '2026-11-09'));
    expect(screen.getByRole('button', { name: 'Monday, November 9, 2026' })).toBeSelected();
  });

  it('forwards the calendar props', async () => {
    await renderWithProviders(
      <DatePickerSheet
        visible
        initialMonth="2026-11"
        minDate="2026-11-10"
        disabledDates={['2026-11-12']}
        isDateDisabled={(iso) => iso === '2026-11-13'}
        firstDayOfWeek={6}
        renderDayLabel={(_iso, label) => `d${label}`}
        onConfirm={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Monday, November 9, 2026' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Thursday, November 12, 2026' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Friday, November 13, 2026' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saturday, November 14, 2026' })).toBeEnabled();
    expect(screen.getByText('d14')).toBeOnTheScreen();
    // Saturday-first: the grid opens on the Saturday before 1 November.
    expect(screen.getByRole('button', { name: 'Saturday, October 31, 2026' })).toBeOnTheScreen();
  });

  it('uses the given title', async () => {
    await renderWithProviders(
      <DatePickerSheet visible title="Pick a day" onConfirm={jest.fn()} onClose={jest.fn()} />,
    );
    expect(screen.getByRole('header', { name: 'Pick a day' })).toBeOnTheScreen();
  });
});
