import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { TimePickerSheet } from './TimePickerSheet';

describe('TimePickerSheet', () => {
  it('renders the title and confirms the value on Confirm', async () => {
    const onConfirm = jest.fn();
    const { user } = await renderWithProviders(
      <TimePickerSheet visible value="14:30" onConfirm={onConfirm} onClose={jest.fn()} />,
    );
    expect(screen.getByRole('header', { name: 'Select a time' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledWith('14:30');
  });

  it('confirms the default time when nothing was chosen yet', async () => {
    const onConfirm = jest.fn();
    const { user } = await renderWithProviders(
      <TimePickerSheet visible onConfirm={onConfirm} onClose={jest.fn()} />,
    );
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledWith('09:00');
  });
});
