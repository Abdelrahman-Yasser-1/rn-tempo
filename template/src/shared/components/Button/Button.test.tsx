import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Button } from './Button';

describe('Button', () => {
  it('renders its title as a button', async () => {
    await renderWithProviders(<Button title="Save" />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeOnTheScreen();
  });

  it('calls onPress when pressed', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(<Button title="Save" onPress={onPress} />);
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('prefers accessibilityLabel over the visible title', async () => {
    await renderWithProviders(<Button title="Go" accessibilityLabel="Continue to checkout" />);
    expect(screen.getByRole('button', { name: 'Continue to checkout' })).toBeOnTheScreen();
  });

  it('is disabled and ignores presses when disabled', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <Button title="Save" disabled onPress={onPress} />,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    await user.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a spinner, announces busy, and blocks presses while loading', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <Button title="Save" loading onPress={onPress} testID="save" />,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    // eslint-disable-next-line no-restricted-syntax -- ActivityIndicator has no accessible role
    expect(screen.getByTestId('save.spinner')).toBeOnTheScreen();
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    await user.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows no spinner when idle', async () => {
    await renderWithProviders(<Button title="Save" testID="save" />);
    expect(screen.getByText('Save')).toBeOnTheScreen();
    expect(screen.queryByRole('progressbar')).not.toBeOnTheScreen();
  });
});
