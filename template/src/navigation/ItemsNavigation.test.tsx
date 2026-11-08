import { screen } from '@testing-library/react-native';

import { useAuthStore } from '@features/auth';
import { useNetworkStore } from '@services/network/network';
import { createUser } from '@test-utils/factories/user';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { createHomeStack } from './stacks';

// Regression guard: the static API hands screens only `{ route }`, so a screen that reads
// `navigation` from props crashes on the first press. Fake-navigation unit tests cannot see that.
describe('home stack navigation (real navigator)', () => {
  beforeEach(() => {
    useNetworkStore.setState({ isConnected: true, isInternetReachable: true });
    useAuthStore.setState({ status: 'signedIn', user: createUser(), pendingLink: null });
  });

  test('pressing Browse items on Home opens the items list', async () => {
    const HomeStack = createHomeStack().getComponent();
    const { user } = await renderWithProviders(<HomeStack />);

    await user.press(await screen.findByRole('button', { name: 'Browse items' }));

    // eslint-disable-next-line rn-tempo/discouraged-syntax -- screen container has no role query
    expect(await screen.findByTestId('items-list-screen')).toBeOnTheScreen();
  });
});
