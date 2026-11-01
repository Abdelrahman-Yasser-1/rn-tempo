import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Chip } from './Chip';

describe('Chip', () => {
  it('renders its label as a button', async () => {
    await renderWithProviders(<Chip label="Groceries" testID="chip" />);
    expect(screen.getByRole('button', { name: 'Groceries' })).toBeOnTheScreen();
    expect(screen.getByText('Groceries')).toBeOnTheScreen();
  });

  it('exposes the selected state', async () => {
    await renderWithProviders(<Chip label="All" selected />);
    expect(screen.getByRole('button', { name: 'All' })).toBeSelected();
  });

  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(<Chip label="All" onPress={onPress} />);
    await user.press(screen.getByRole('button', { name: 'All' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses when disabled', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(<Chip label="All" disabled onPress={onPress} />);
    const chip = screen.getByRole('button', { name: 'All' });
    expect(chip).toBeDisabled();
    await user.press(chip);
    expect(onPress).not.toHaveBeenCalled();
  });
});
