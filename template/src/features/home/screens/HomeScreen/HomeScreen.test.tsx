import { useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';

import { useAuthStore } from '@features/auth';
import type { HomeStackParamList } from '@navigation/types';
import { useNetworkStore } from '@services/network/network';
import { Button, Text } from '@shared/components';
import { createUser } from '@test-utils/factories/user';
import { server } from '@test-utils/msw/server';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { HomeScreen } from './HomeScreen';

const Stack = createNativeStackNavigator<HomeStackParamList>();

/** Stands in for the samples list so Home's navigation can be observed and returned from. */
function ItemsListStub() {
  const navigation = useNavigation();
  return (
    <>
      <Text>Items list stub</Text>
      <Button
        title="Return to home"
        onPress={() => {
          navigation.goBack();
        }}
      />
    </>
  );
}

/** A real native stack, so focus and navigation behave as they do in the app. */
function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="ItemsList" component={ItemsListStub} />
    </Stack.Navigator>
  );
}

/** Serves `/auth/me` with a user of the given first name and counts the calls. */
function mockCurrentUser(firstName: string) {
  const handler = jest.fn(() => HttpResponse.json(createUser({ firstName })));
  server.use(http.get('*/auth/me', handler));
  return handler;
}

beforeEach(() => {
  useNetworkStore.setState({ isConnected: true, isInternetReachable: true });
  useAuthStore.setState({
    status: 'signedIn',
    user: createUser({ firstName: 'Stored' }),
    pendingLink: null,
  });
});

describe('HomeScreen', () => {
  test('AC-1: greets the signed-in user by first name', async () => {
    mockCurrentUser('Ada');

    await renderWithProviders(<HomeStack />);

    expect(await screen.findByText('Hello, Ada')).toBeOnTheScreen();
  });

  test('falls back to the stored user name when the current user cannot be fetched', async () => {
    server.use(http.get('*/auth/me', () => HttpResponse.json({}, { status: 500 })));

    await renderWithProviders(<HomeStack />);

    expect(await screen.findByText('Hello, Stored')).toBeOnTheScreen();
  });

  test('uses a plain greeting when no user is known', async () => {
    useAuthStore.setState({ user: null });
    server.use(http.get('*/auth/me', () => HttpResponse.json({}, { status: 500 })));

    await renderWithProviders(<HomeStack />);

    expect(await screen.findByText('Hello')).toBeOnTheScreen();
  });

  test('AC-2: shows the offline banner while the device is offline', async () => {
    useNetworkStore.setState({ isConnected: false, isInternetReachable: false });

    await renderWithProviders(<HomeStack />);

    expect(screen.getByRole('alert')).toHaveTextContent('You are offline');
  });

  test('AC-2: hides the offline banner while the device is online', async () => {
    await renderWithProviders(<HomeStack />);

    expect(screen.queryByText('You are offline')).not.toBeOnTheScreen();
  });

  test('AC-3: regaining focus refetches the current user, but the first focus does not', async () => {
    const currentUser = mockCurrentUser('Ada');
    const { user } = await renderWithProviders(<HomeStack />);
    await screen.findByText('Hello, Ada');
    expect(currentUser).toHaveBeenCalledTimes(1);

    await user.press(screen.getByRole('button', { name: 'Browse items' }));
    expect(await screen.findByText('Items list stub')).toBeOnTheScreen();
    expect(currentUser).toHaveBeenCalledTimes(1);

    await user.press(screen.getByRole('button', { name: 'Return to home' }));

    await waitFor(() => {
      expect(currentUser).toHaveBeenCalledTimes(2);
    });
  });

  test('AC-4: Browse items opens ItemsList', async () => {
    mockCurrentUser('Ada');
    const { user } = await renderWithProviders(<HomeStack />);

    await user.press(screen.getByRole('button', { name: 'Browse items' }));

    expect(await screen.findByText('Items list stub')).toBeOnTheScreen();
  });
});
