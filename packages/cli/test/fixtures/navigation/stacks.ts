import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ComponentType } from 'react';

import { LINK_PATHS } from './linking';

/** Home tab stack. Item routes belong to the `samples` module (contract C12). */
export function createHomeStack(placeholder: ComponentType) {
  return createNativeStackNavigator({
    screens: {
      Home: { screen: placeholder, linking: LINK_PATHS.Home },
      // @tempo-feature:samples:start
      ItemsList: { screen: placeholder, linking: LINK_PATHS.ItemsList },
      ItemCreate: { screen: placeholder, linking: LINK_PATHS.ItemCreate },
      ItemDetails: {
        screen: placeholder,
        linking: { path: LINK_PATHS.ItemDetails, parse: { itemId: Number } },
      },
      // @tempo-feature:samples:end
    },
  });
}

/** Profile tab stack. */
export function createProfileStack(placeholder: ComponentType) {
  return createNativeStackNavigator({
    screens: {
      Profile: { screen: placeholder, linking: LINK_PATHS.Profile },
      EditProfile: { screen: placeholder, linking: LINK_PATHS.EditProfile },
    },
  });
}

/** Settings tab stack. */
export function createSettingsStack(placeholder: ComponentType) {
  return createNativeStackNavigator({
    screens: {
      Settings: { screen: placeholder, linking: LINK_PATHS.Settings },
      Language: { screen: placeholder, linking: LINK_PATHS.Language },
      Theme: { screen: placeholder, linking: LINK_PATHS.Theme },
      About: { screen: placeholder, linking: LINK_PATHS.About },
    },
  });
}
