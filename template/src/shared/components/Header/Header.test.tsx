import { useNavigation } from '@react-navigation/native';
import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Header } from './Header';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: jest.fn(),
}));

function WithNavigationBack() {
  const navigation = useNavigation();
  return <Header title="Details" onBack={navigation.goBack} />;
}

describe('Header', () => {
  it('exposes the title as a header', async () => {
    await renderWithProviders(<Header title="Profile" />);
    expect(screen.getByRole('header', { name: 'Profile' })).toBeOnTheScreen();
  });

  it('shows no back button without onBack', async () => {
    await renderWithProviders(<Header title="Home" />);
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('calls onBack from the default back button', async () => {
    const onBack = jest.fn();
    const { user } = await renderWithProviders(<Header title="Profile" onBack={onBack} />);
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('uses a custom back label when given', async () => {
    await renderWithProviders(<Header title="Profile" onBack={jest.fn()} backLabel="Close" />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
  });

  it('renders trailing actions', async () => {
    const onSave = jest.fn();
    const { user } = await renderWithProviders(
      <Header
        title="Edit"
        actions={[{ icon: 'check', accessibilityLabel: 'Save', onPress: onSave }]}
      />,
    );
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('shows the subtitle under the title', async () => {
    await renderWithProviders(<Header title="Inbox" subtitle="3 unread" />);
    expect(screen.getByText('3 unread')).toBeOnTheScreen();
  });

  it('omits an empty subtitle', async () => {
    await renderWithProviders(<Header title="Inbox" subtitle="" testID="head" />);
    // eslint-disable-next-line no-restricted-syntax -- subtitle text node is absent, so no role to query
    expect(screen.queryByTestId('head.subtitle')).not.toBeOnTheScreen();
  });

  it('shows at most three actions, each named and pressable', async () => {
    const onPress = jest.fn();
    const { user } = await renderWithProviders(
      <Header
        title="Edit"
        actions={[
          { icon: 'check', accessibilityLabel: 'Save', onPress },
          { icon: 'plus', accessibilityLabel: 'Share', onPress: jest.fn() },
          { icon: 'trash', accessibilityLabel: 'Delete', onPress: jest.fn() },
          { icon: 'close', accessibilityLabel: 'Dismiss', onPress: jest.fn() },
        ]}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each(['default', 'transparent', 'onColor'] as const)(
    'renders the %s variant with its back button and actions',
    async (variant) => {
      await renderWithProviders(
        <Header
          title="Profile"
          variant={variant}
          onBack={jest.fn()}
          actions={[{ icon: 'check', accessibilityLabel: 'Save', onPress: jest.fn() }]}
        />,
      );
      expect(screen.getByRole('header', { name: 'Profile' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Save' })).toBeOnTheScreen();
    },
  );

  it('goes back through the navigation hook when wired as onBack', async () => {
    const goBack = jest.fn();
    jest.mocked(useNavigation).mockReturnValue({ goBack });
    const { user } = await renderWithProviders(<WithNavigationBack />);
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(goBack).toHaveBeenCalledTimes(1);
  });
});
