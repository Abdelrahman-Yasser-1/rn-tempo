import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ComponentType } from 'react';

import { LINK_PATHS } from './linking';

/**
 * Signed-out stack. WS9 (task 9.1): replace the placeholder with each feature screen from
 * `@features/auth`.
 */
export function createAuthNavigator(placeholder: ComponentType) {
  return createNativeStackNavigator({
    initialRouteName: 'Login',
    screens: {
      Onboarding: { screen: placeholder, linking: LINK_PATHS.Onboarding },
      Login: { screen: placeholder, linking: LINK_PATHS.Login },
      Register: { screen: placeholder, linking: LINK_PATHS.Register },
      ForgotPassword: { screen: placeholder, linking: LINK_PATHS.ForgotPassword },
      Otp: { screen: placeholder, linking: LINK_PATHS.Otp },
    },
  });
}
