import { screen } from '@testing-library/react-native';
import type { TestInstance } from 'test-renderer';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Switch } from './Switch';

/** Host element types of the switch's children, in render order. */
function childTypes(element: TestInstance): string[] {
  return (element.children as TestInstance[]).map((child) => child.type);
}

describe('Switch', () => {
  it('is a switch named by its label and reports the on state', async () => {
    await renderWithProviders(<Switch value onValueChange={jest.fn()} label="Notifications" />);
    expect(screen.getByRole('switch', { name: 'Notifications' })).toBeChecked();
  });

  it('reports the off state', async () => {
    await renderWithProviders(<Switch value={false} onValueChange={jest.fn()} label="Dark mode" />);
    expect(screen.getByRole('switch', { name: 'Dark mode' })).not.toBeChecked();
  });

  it('toggles with the opposite value when pressed', async () => {
    const onValueChange = jest.fn();
    const { user } = await renderWithProviders(
      <Switch value={false} onValueChange={onValueChange} label="Sound" />,
    );
    await user.press(screen.getByRole('switch', { name: 'Sound' }));
    expect(onValueChange).toHaveBeenLastCalledWith(true);
  });

  it('ignores presses when disabled', async () => {
    const onValueChange = jest.fn();
    const { user } = await renderWithProviders(
      <Switch value={false} disabled onValueChange={onValueChange} label="Sound" />,
    );
    const toggle = screen.getByRole('switch', { name: 'Sound' });
    expect(toggle).toBeDisabled();
    await user.press(toggle);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('prefers accessibilityLabel over the visible label', async () => {
    await renderWithProviders(
      <Switch value onValueChange={jest.fn()} label="Sound" accessibilityLabel="Sound effects" />,
    );
    expect(screen.getByRole('switch', { name: 'Sound effects' })).toBeOnTheScreen();
  });

  it('puts the label before the track by default', async () => {
    await renderWithProviders(<Switch value onValueChange={jest.fn()} label="Sound" />);
    expect(childTypes(screen.getByRole('switch'))).toEqual(['Text', 'View']);
  });

  it('puts the label after the track with labelPosition end', async () => {
    await renderWithProviders(
      <Switch value onValueChange={jest.fn()} label="Sound" labelPosition="end" />,
    );
    expect(childTypes(screen.getByRole('switch'))).toEqual(['View', 'Text']);
  });

  it('toggles when the label text is pressed', async () => {
    const onValueChange = jest.fn();
    const { user } = await renderWithProviders(
      <Switch value={false} onValueChange={onValueChange} label="Sound" />,
    );
    await user.press(screen.getByText('Sound'));
    expect(onValueChange).toHaveBeenLastCalledWith(true);
  });

  it('turns an on switch off when pressed', async () => {
    const onValueChange = jest.fn();
    const { user } = await renderWithProviders(
      <Switch value onValueChange={onValueChange} label="Sound" />,
    );
    await user.press(screen.getByRole('switch', { name: 'Sound' }));
    expect(onValueChange).toHaveBeenLastCalledWith(false);
  });

  it('renders only the track without a label', async () => {
    await renderWithProviders(
      <Switch value onValueChange={jest.fn()} accessibilityLabel="Sound" />,
    );
    expect(childTypes(screen.getByRole('switch', { name: 'Sound' }))).toEqual(['View']);
  });
});
