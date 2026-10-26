/* eslint-disable no-restricted-imports -- test double screens render plain RN Text */
import { useRoute } from '@react-navigation/native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Linking, Text } from 'react-native';

import { useAuthStore } from '@features/auth';
import { initI18nInstance } from '@services/i18n/i18n';
import { createUser } from '@test-utils/factories/user';

import { linking, startPendingLinkResume } from './linking';
import { createRootNavigator } from './RootNavigator';

function Named() {
  const { name } = useRoute();
  return <Text>{`screen:${name}`}</Text>;
}
function Fixed({ label }: Readonly<{ label: string }>) {
  return <Text>{`screen:${label}`}</Text>;
}

const Navigation = createRootNavigator({
  Placeholder: Named,
  ForceUpdate: () => <Fixed label="ForceUpdate" />,
  Maintenance: () => <Fixed label="Maintenance" />,
  NotFound: () => <Fixed label="NotFound" />,
  DebugMenu: () => <Fixed label="DebugMenu" />,
});

const initialUrl = jest.spyOn(Linking, 'getInitialURL');

beforeAll(async () => {
  await initI18nInstance('en');
});

beforeEach(() => {
  initialUrl.mockResolvedValue(null);
  useAuthStore.setState({ status: 'signedOut', user: null, pendingLink: null });
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe('RootNavigator', () => {
  test('AC-9: signed out lands on Login', async () => {
    await render(<Navigation linking={linking} />);

    expect(await screen.findByText('screen:Login')).toBeOnTheScreen();
  });

  test('AC-9: signed in lands on the Home tab', async () => {
    useAuthStore.setState({ status: 'signedIn', user: createUser() });

    await render(<Navigation linking={linking} />);

    expect(await screen.findByText('screen:Home')).toBeOnTheScreen();
  });

  test('AC-9: a protected link while signed out opens Login, then Settings after sign-in', async () => {
    initialUrl.mockResolvedValue('tempo-dev://settings');
    const stop = startPendingLinkResume();

    await render(<Navigation linking={linking} />);
    expect(await screen.findByText('screen:Login')).toBeOnTheScreen();
    expect(useAuthStore.getState().pendingLink).toBe('tempo-dev://settings');

    await act(async () => {
      await useAuthStore.getState().signIn({ accessToken: 'a', refreshToken: 'r' }, createUser());
    });

    await waitFor(() => {
      expect(screen.getByText('screen:Settings')).toBeOnTheScreen();
    });
    expect(useAuthStore.getState().pendingLink).toBeNull();
    stop();
  });

  test.each([
    ['tempo-dev://settings', 'screen:Settings'],
    ['tempo-dev://settings/theme', 'screen:Theme'],
    ['tempo-dev://profile/edit', 'screen:EditProfile'],
    ['tempo-dev://items/42', 'screen:ItemDetails'],
    ['tempo-dev://debug', 'screen:DebugMenu'],
    ['tempo-dev://definitely/not/a/route', 'screen:NotFound'],
  ])('AC-9: signed in, %s opens %s', async (url, expected) => {
    useAuthStore.setState({ status: 'signedIn', user: createUser() });
    initialUrl.mockResolvedValue(url);

    await render(<Navigation linking={linking} />);

    expect(await screen.findByText(expected)).toBeOnTheScreen();
  });
});
