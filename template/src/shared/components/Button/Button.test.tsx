import { fireEvent, screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Button } from './Button';

/** Element types of the content row's children, in render order. */
function childOrder(button: TestInstance): string[] {
  const [row] = button.children as TestInstance[];
  return (row?.children as TestInstance[]).map((child) => child.type);
}

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
    const { user } = await renderWithProviders(<Button title="Save" disabled onPress={onPress} />);
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
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- ActivityIndicator has no accessible role
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

  it.each([
    'primary',
    'neutral',
    'secondary',
    'outline',
    'outlineOnColor',
    'subtle',
    'ghost',
    'danger',
    'dangerOutline',
    'dangerSubtle',
    'dangerGhost',
    'link',
  ] as const)('renders the %s variant as a pressable button', async (variant) => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <Button title="Go" variant={variant} onPress={onPress} />,
    );
    await user.press(screen.getByRole('button', { name: 'Go' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each(['sm', 'md', 'lg'] as const)('renders the %s size', async (size) => {
    await renderWithProviders(<Button title="Go" size={size} icon="plus" />);
    expect(screen.getByRole('button', { name: 'Go' })).toBeOnTheScreen();
  });

  it('puts the icon before the label by default and after it with iconPosition end', async () => {
    const { rerender } = await renderWithProviders(<Button title="Add" icon="plus" />);
    expect(childOrder(screen.getByRole('button'))).toEqual(['RNSVGSvgView', 'Text']);
    await rerender(<Button title="Add" icon="plus" iconPosition="end" />);
    expect(childOrder(screen.getByRole('button'))).toEqual(['Text', 'RNSVGSvgView']);
  });

  it('puts the spinner where the icon would be', async () => {
    const { rerender } = await renderWithProviders(
      <Button title="Add" icon="plus" loading testID="add" />,
    );
    expect(childOrder(screen.getByRole('button'))).toEqual(['ActivityIndicator', 'Text']);
    await rerender(<Button title="Add" icon="plus" iconPosition="end" loading testID="add" />);
    expect(childOrder(screen.getByRole('button'))).toEqual(['Text', 'ActivityIndicator']);
  });

  it('underlines a link while it is pressed and forwards the press handlers', async () => {
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    await renderWithProviders(
      <Button title="Terms" variant="link" onPressIn={onPressIn} onPressOut={onPressOut} />,
    );
    const button = screen.getByRole('button', { name: 'Terms' });
    expect(screen.getByText('Terms')).not.toHaveStyle({ textDecorationLine: 'underline' });
    await fireEvent(button, 'pressIn');
    expect(screen.getByText('Terms')).toHaveStyle({ textDecorationLine: 'underline' });
    expect(onPressIn).toHaveBeenCalledTimes(1);
    await fireEvent(button, 'pressOut');
    expect(screen.getByText('Terms')).not.toHaveStyle({ textDecorationLine: 'underline' });
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  it('does not underline the other variants while pressed', async () => {
    await renderWithProviders(<Button title="Save" />);
    await fireEvent(screen.getByRole('button', { name: 'Save' }), 'pressIn');
    expect(screen.getByText('Save')).not.toHaveStyle({ textDecorationLine: 'underline' });
  });

  it('renders a translated label from tx', async () => {
    await renderWithProviders(<Button tx="sheet.close" />);
    expect(await screen.findByText('Close')).toBeOnTheScreen();
  });
});
