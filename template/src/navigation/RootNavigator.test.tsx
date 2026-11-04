/* eslint-disable no-restricted-imports -- test double screens render plain RN Text */
import { act, render, screen, waitFor } from '@testing-library/react-native';
import type { ComponentType } from 'react';
import { Linking, Text } from 'react-native';

import { ENV } from '@config/env';
import { useAuthStore } from '@features/auth';
import { initI18nInstance } from '@services/i18n/i18n';
import { createUser } from '@test-utils/factories/user';

import { linking, startPendingLinkResume } from './linking';
import { createRootNavigator } from './RootNavigator';

// The scheme is renamed per project, so tests read it from the env instead of hard-coding it.
const SCHEME = `${ENV.DEEP_LINK_SCHEME}://`;

function Fixed({ label }: Readonly<{ label: string }>) {
  return <Text>{`screen:${label}`}</Text>;
}

// Real auth screens need app providers; this suite only checks routing, so they become named stubs.
jest.mock('@features/onboarding', () => ({
  OnboardingScreen: () => null,
  useShouldShowOnboarding: () => false,
}));
jest.mock('@features/auth', () => {
  const actual = jest.requireActual<Record<string, unknown>>('@features/auth');
  const { Text: MockText } = jest.requireActual<{ Text: typeof Text }>('react-native');
  const stub = (label: string) => () => <MockText>{`screen:${label}`}</MockText>;
  return {
    ...actual,
    LoginScreen: stub('Login'),
    RegisterScreen: stub('Register'),
    ForgotPasswordScreen: stub('ForgotPassword'),
    OtpScreen: stub('Otp'),
  };
});

// Real tab screens need app providers; they become stubs that name their route.
jest.mock('@features/home', () => {
  const { Text: MockText } = jest.requireActual<{ Text: ComponentType<{ children: string }> }>(
    'react-native',
  );
  return {
    HomeScreen: () => <MockText>{'screen:Home'}</MockText>,
  };
});
// @tempo-feature:samples:start
jest.mock('@features/items', () => {
  const { Text: MockText } = jest.requireActual<{ Text: ComponentType<{ children: string }> }>(
    'react-native',
  );
  const { useRoute: useMockRoute } = jest.requireActual<{ useRoute: () => { name: string } }>(
    '@react-navigation/native',
  );
  const Named = () => <MockText>{`screen:${useMockRoute().name}`}</MockText>;
  return { ItemsListScreen: Named, ItemDetailsScreen: Named, ItemCreateScreen: Named };
});
// @tempo-feature:samples:end
jest.mock('@features/profile', () => {
  const { Text: MockText } = jest.requireActual<{ Text: ComponentType<{ children: string }> }>(
    'react-native',
  );
  return {
    ProfileScreen: () => <MockText>{'screen:Profile'}</MockText>,
    EditProfileScreen: () => <MockText>{'screen:EditProfile'}</MockText>,
  };
});
jest.mock('@features/settings', () => {
  const { Text: MockText } = jest.requireActual<{ Text: ComponentType<{ children: string }> }>(
    'react-native',
  );
  return {
    SettingsScreen: () => <MockText>{'screen:Settings'}</MockText>,
    LanguageScreen: () => <MockText>{'screen:Language'}</MockText>,
    ThemeScreen: () => <MockText>{'screen:Theme'}</MockText>,
    AboutScreen: () => <MockText>{'screen:About'}</MockText>,
  };
});

const Navigation = createRootNavigator({
  ForceUpdate: () => <Fixed label="ForceUpdate" />,
  Maintenance: () => <Fixed label="Maintenance" />,
  NotFound: () => <Fixed label="NotFound" />,
  DebugMenu: () => <Fixed label="DebugMenu" />,
  WebView: () => <Fixed label="WebView" />, // @tempo-feature:webview
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
    initialUrl.mockResolvedValue(`${SCHEME}settings`);
    const stop = startPendingLinkResume();

    await render(<Navigation linking={linking} />);
    expect(await screen.findByText('screen:Login')).toBeOnTheScreen();
    expect(useAuthStore.getState().pendingLink).toBe(`${SCHEME}settings`);

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
    [`${SCHEME}settings`, 'screen:Settings'],
    [`${SCHEME}settings/theme`, 'screen:Theme'],
    [`${SCHEME}profile/edit`, 'screen:EditProfile'],
    [`${SCHEME}items/42`, 'screen:ItemDetails'], // @tempo-feature:samples
    [`${SCHEME}debug`, 'screen:DebugMenu'],
    [`${SCHEME}definitely/not/a/route`, 'screen:NotFound'],
  ])('AC-9: signed in, %s opens %s', async (url, expected) => {
    useAuthStore.setState({ status: 'signedIn', user: createUser() });
    initialUrl.mockResolvedValue(url);

    await render(<Navigation linking={linking} />);

    expect(await screen.findByText(expected)).toBeOnTheScreen();
  });
});
