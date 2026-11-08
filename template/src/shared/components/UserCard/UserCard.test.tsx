import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { UserCard } from './UserCard';

describe('UserCard', () => {
  it('shows the name, meta lines and initials', async () => {
    await renderWithProviders(
      <UserCard name="Ada Lovelace" meta={['Engineer', 'ada@example.test']} />,
    );
    expect(screen.getByText('Ada Lovelace')).toBeOnTheScreen();
    expect(screen.getByText('Engineer')).toBeOnTheScreen();
    expect(screen.getByText('ada@example.test')).toBeOnTheScreen();
    // The avatar is decorative here (the name is right beside it), so it is hidden from assistive tech.
    expect(screen.getByText('AL', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('is not a button without onPress', async () => {
    await renderWithProviders(<UserCard name="Ada Lovelace" />);
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('becomes a button named by name and meta', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <UserCard name="Ada Lovelace" meta={['Engineer']} onPress={onPress} />,
    );
    await user.press(screen.getByRole('button', { name: 'Ada Lovelace, Engineer' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders the trailing slot', async () => {
    await renderWithProviders(<UserCard name="Ada" trailing={<Text>Admin</Text>} />);
    expect(screen.getByText('Admin')).toBeOnTheScreen();
  });

  it('uses a custom accessibilityLabel for the button', async () => {
    await renderWithProviders(
      <UserCard
        name="Ada Lovelace"
        meta={['Engineer']}
        accessibilityLabel="Open profile of Ada"
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Open profile of Ada' })).toBeOnTheScreen();
  });

  it('names the button after the name alone without meta lines', async () => {
    await renderWithProviders(<UserCard name="Ada Lovelace" onPress={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Ada Lovelace' })).toBeOnTheScreen();
  });

  it('keeps the trailing slot inside the pressable card', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <UserCard name="Ada" trailing={<Text>Admin</Text>} onPress={onPress} />,
    );
    await user.press(screen.getByText('Admin'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('passes the testID to the card and its name', async () => {
    await renderWithProviders(<UserCard name="Ada" testID="user" />);
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- checks the testID plumbing itself
    expect(screen.getByTestId('user.name')).toHaveTextContent('Ada');
  });
});
