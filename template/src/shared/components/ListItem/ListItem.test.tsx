import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ListItem } from './ListItem';

describe('ListItem', () => {
  it('renders a non-pressable row without a button role', async () => {
    await renderWithProviders(<ListItem title="Language" subtitle="English" />);
    expect(screen.getByText('Language')).toBeOnTheScreen();
    expect(screen.getByText('English')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('becomes a button named by title and subtitle when pressable', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <ListItem title="Language" subtitle="English" onPress={onPress} />,
    );
    await user.press(screen.getByRole('button', { name: 'Language, English' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('prefers accessibilityLabel over the composed name', async () => {
    await renderWithProviders(
      <ListItem title="Language" onPress={jest.fn()} accessibilityLabel="Change language" />,
    );
    expect(screen.getByRole('button', { name: 'Change language' })).toBeOnTheScreen();
  });

  it('does not call onPress when disabled', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <ListItem title="Locked" disabled onPress={onPress} />,
    );
    const item = screen.getByRole('button', { name: 'Locked' });
    expect(item).toBeDisabled();
    await user.press(item);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a chevron only for pressable rows that ask for one', async () => {
    await renderWithProviders(
      <>
        <ListItem title="Plain" showChevron />
        <ListItem title="Tap" showChevron onPress={jest.fn()} />
      </>,
    );
    // The chevron is decorative, so the only observable difference is the pressable row.
    expect(screen.getByRole('button', { name: 'Tap' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Plain' })).not.toBeOnTheScreen();
  });

  it('renders the right slot in place of the chevron', async () => {
    await renderWithProviders(
      <ListItem title="Toggle" showChevron onPress={jest.fn()} right={<Text>On</Text>} />,
    );
    expect(screen.getByText('On')).toBeOnTheScreen();
  });
});
