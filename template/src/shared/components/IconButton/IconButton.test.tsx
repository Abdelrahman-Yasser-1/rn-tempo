import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { IconButton } from './IconButton';

describe('IconButton', () => {
  it('is a button named by its required accessibilityLabel', async () => {
    await renderWithProviders(<IconButton icon="close" accessibilityLabel="Close dialog" />);
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeOnTheScreen();
  });

  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <IconButton icon="close" accessibilityLabel="Close" onPress={onPress} />,
    );
    await user.press(screen.getByRole('button', { name: 'Close' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is disabled and ignores presses when disabled', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <IconButton icon="close" accessibilityLabel="Close" disabled onPress={onPress} />,
    );
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).toBeDisabled();
    await user.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a spinner, is busy and blocks presses while loading', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <IconButton icon="refresh" accessibilityLabel="Refresh" loading onPress={onPress} />,
    );
    const button = screen.getByRole('button', { name: 'Refresh' });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    await user.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
