import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Fab } from './Fab';

describe('Fab', () => {
  it('renders an icon-only button with its accessible name and fires onPress', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <Fab icon="plus" accessibilityLabel="Add item" onPress={onPress} />,
    );
    await user.press(screen.getByRole('button', { name: 'Add item' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows the label of an extended Fab', async () => {
    await renderWithProviders(<Fab icon="plus" label="New" onPress={jest.fn()} testID="fab" />);
    expect(screen.getByRole('button', { name: 'New' })).toBeOnTheScreen();
    expect(screen.getByText('New')).toBeOnTheScreen();
  });

  it('renders nothing while not visible', async () => {
    await renderWithProviders(
      <Fab icon="plus" accessibilityLabel="Add item" visible={false} onPress={jest.fn()} />,
    );
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('shows only the icon, named by accessibilityLabel, when it has no label', async () => {
    await renderWithProviders(
      <Fab icon="plus" accessibilityLabel="Add item" onPress={jest.fn()} testID="fab" />,
    );
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- checks the testID plumbing itself
    expect(screen.queryByTestId('fab.label')).not.toBeOnTheScreen();
    expect(screen.queryByText('Add item')).not.toBeOnTheScreen();
  });

  it('treats an empty label as icon-only', async () => {
    await renderWithProviders(
      <Fab icon="plus" label="" accessibilityLabel="Add item" onPress={jest.fn()} testID="fab" />,
    );
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- checks the testID plumbing itself
    expect(screen.queryByTestId('fab.label')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add item' })).toBeOnTheScreen();
  });

  it('prefers accessibilityLabel over the visible label for the button name', async () => {
    await renderWithProviders(
      <Fab icon="plus" label="New" accessibilityLabel="Create a new item" onPress={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Create a new item' })).toBeOnTheScreen();
    expect(screen.getByText('New')).toBeOnTheScreen();
  });

  it('fires onPress from the extended form', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(<Fab icon="plus" label="New" onPress={onPress} />);
    await user.press(screen.getByRole('button', { name: 'New' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('appears and disappears with the visible prop', async () => {
    const { rerender } = await renderWithProviders(
      <Fab icon="plus" accessibilityLabel="Add item" visible={false} onPress={jest.fn()} />,
    );
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
    await rerender(<Fab icon="plus" accessibilityLabel="Add item" visible onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Add item' })).toBeOnTheScreen();
  });
});
