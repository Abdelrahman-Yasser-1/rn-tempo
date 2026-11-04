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
});
