import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Switch } from './Switch';

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
});
