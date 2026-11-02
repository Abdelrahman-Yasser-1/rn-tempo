import { screen } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import type { ComponentProps } from 'react';

import { useAuthStore } from '@features/auth';
import { useNetworkStore } from '@services/network/network';
import { createUser } from '@test-utils/factories/user';
import { server } from '@test-utils/msw/server';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ProfileScreen } from './ProfileScreen';

type ProfileProps = ComponentProps<typeof ProfileScreen>;

function makeNavigation() {
  return { navigate: jest.fn(), reset: jest.fn(), goBack: jest.fn() };
}

async function renderProfile(navigation = makeNavigation()) {
  const props = {
    navigation,
    route: { key: 'Profile', name: 'Profile' },
  } as unknown as ProfileProps;
  return renderWithProviders(<ProfileScreen {...props} />);
}

beforeEach(() => {
  useNetworkStore.setState({ isConnected: true, isInternetReachable: true });
});

describe('ProfileScreen', () => {
  test('AC-1: shows the avatar, full name and email of the signed-in user', async () => {
    const user = createUser({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.test',
    });
    useAuthStore.setState({ status: 'signedIn', user });
    server.use(http.get('*/auth/me', () => HttpResponse.json(user)));

    await renderProfile();

    expect(await screen.findByText('Ada Lovelace')).toBeOnTheScreen();
    expect(screen.getByText('ada@example.test')).toBeOnTheScreen();
    expect(screen.getByLabelText('Profile photo')).toBeOnTheScreen();
  });

  test('AC-1: falls back to the stored user when the current user cannot be fetched', async () => {
    const user = createUser({
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@example.test',
    });
    useAuthStore.setState({ status: 'signedIn', user });
    server.use(http.get('*/auth/me', () => HttpResponse.json({}, { status: 500 })));

    await renderProfile();

    expect(await screen.findByText('Grace Hopper')).toBeOnTheScreen();
    expect(screen.getByText('grace@example.test')).toBeOnTheScreen();
  });

  test('the Edit profile button opens EditProfile', async () => {
    const navigation = makeNavigation();
    useAuthStore.setState({ status: 'signedIn', user: createUser() });
    server.use(http.get('*/auth/me', () => HttpResponse.json(createUser())));
    const { user } = await renderProfile(navigation);

    await user.press(screen.getByRole('button', { name: 'Edit profile' }));

    expect(navigation.navigate).toHaveBeenCalledWith('EditProfile');
  });
});
