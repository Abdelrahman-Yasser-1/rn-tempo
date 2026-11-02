import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { HomeScreen } from '@features/home';
// @tempo-feature:samples:start
import { ItemCreateScreen, ItemDetailsScreen, ItemsListScreen } from '@features/items';
// @tempo-feature:samples:end
import { EditProfileScreen, ProfileScreen } from '@features/profile';
import { AboutScreen, LanguageScreen, SettingsScreen, ThemeScreen } from '@features/settings';

import { LINK_PATHS } from './linking';

// Screens render the shared Header themselves, so native headers stay hidden in every stack.
const stackScreenOptions = { headerShown: false } as const;

/** Home tab stack. Item routes belong to the `samples` module (contract C12). */
export function createHomeStack() {
  return createNativeStackNavigator({
    screenOptions: stackScreenOptions,
    screens: {
      Home: { screen: HomeScreen, linking: LINK_PATHS.Home },
      // @tempo-feature:samples:start
      ItemsList: { screen: ItemsListScreen, linking: LINK_PATHS.ItemsList },
      ItemCreate: { screen: ItemCreateScreen, linking: LINK_PATHS.ItemCreate },
      ItemDetails: {
        screen: ItemDetailsScreen,
        linking: { path: LINK_PATHS.ItemDetails, parse: { itemId: Number } },
      },
      // @tempo-feature:samples:end
    },
  });
}

/** Profile tab stack. */
export function createProfileStack() {
  return createNativeStackNavigator({
    screenOptions: stackScreenOptions,
    screens: {
      Profile: { screen: ProfileScreen, linking: LINK_PATHS.Profile },
      EditProfile: { screen: EditProfileScreen, linking: LINK_PATHS.EditProfile },
    },
  });
}

/** Settings tab stack. */
export function createSettingsStack() {
  return createNativeStackNavigator({
    screenOptions: stackScreenOptions,
    screens: {
      Settings: { screen: SettingsScreen, linking: LINK_PATHS.Settings },
      Language: { screen: LanguageScreen, linking: LINK_PATHS.Language },
      Theme: { screen: ThemeScreen, linking: LINK_PATHS.Theme },
      About: { screen: AboutScreen, linking: LINK_PATHS.About },
    },
  });
}
