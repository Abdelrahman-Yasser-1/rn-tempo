import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ForgotPasswordScreen, LoginScreen, OtpScreen, RegisterScreen } from '@features/auth';
import { OnboardingScreen, useShouldShowOnboarding } from '@features/onboarding';

import { LINK_PATHS } from './linking';

/**
 * Signed-out stack. Onboarding sits in its own group gated by `useShouldShowOnboarding`; with no
 * `initialRouteName`, the first rendered screen wins, so Login shows once onboarding is done.
 */
export function createAuthNavigator() {
  return createNativeStackNavigator({
    groups: {
      Onboarding: {
        if: useShouldShowOnboarding,
        screens: {
          Onboarding: { screen: OnboardingScreen, linking: LINK_PATHS.Onboarding },
        },
      },
      Credentials: {
        screens: {
          Login: { screen: LoginScreen, linking: LINK_PATHS.Login },
          Register: { screen: RegisterScreen, linking: LINK_PATHS.Register },
          ForgotPassword: { screen: ForgotPasswordScreen, linking: LINK_PATHS.ForgotPassword },
          Otp: { screen: OtpScreen, linking: LINK_PATHS.Otp },
        },
      },
    },
  });
}
