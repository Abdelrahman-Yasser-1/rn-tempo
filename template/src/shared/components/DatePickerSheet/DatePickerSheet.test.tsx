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
});
