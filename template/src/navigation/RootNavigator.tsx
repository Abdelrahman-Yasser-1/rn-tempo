import { createStaticNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ComponentType } from 'react';

import { isProd } from '@config/env';

import { createAuthNavigator } from './AuthNavigator';
import { LINK_PATHS } from './linking';
import { createMainTabs } from './MainTabs';
import type { RootStackParamList } from './types';
import { useIsSignedIn, useIsSignedOut } from './useIsSignedIn';

declare global {
  // React Navigation reads its root param list from this global namespace.
  // eslint-disable-next-line @typescript-eslint/no-namespace -- required by React Navigation typing
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions, @typescript-eslint/no-empty-object-type -- interface merging is required here
    interface RootParamList extends RootStackParamList {}
  }
}

/**
 * Screens that live in `src/app` are handed in by the app layer, because the `navigation` layer
 * may not import `app` (eslint boundaries).
 */
export type AppScreens = {
  /** Stand-in for feature screens that do not exist yet. */
  Placeholder: ComponentType;
  ForceUpdate: ComponentType;
  Maintenance: ComponentType;
  NotFound: ComponentType;
  /** Rendered only in non-prod builds. */
  DebugMenu: ComponentType;
};

/** Builds the root navigator: auth/main groups gated by session, plus status and debug screens. */
export function createRootNavigator(screens: Readonly<AppScreens>) {
  const RootStack = createNativeStackNavigator({
    screenOptions: { headerShown: false },
    groups: {
      SignedOut: {
        if: useIsSignedOut,
        screens: { Auth: createAuthNavigator(screens.Placeholder) },
      },
      SignedIn: {
        if: useIsSignedIn,
        screens: { Main: createMainTabs(screens.Placeholder) },
      },
      Status: {
        screens: {
          ForceUpdate: screens.ForceUpdate,
          Maintenance: screens.Maintenance,
        },
      },
      // Resolved at build time (not a hook): prod bundles never register the debug menu.
      ...(isProd
        ? {}
        : {
            Debug: {
              screenOptions: { presentation: 'modal' as const },
              screens: {
                DebugMenu: { screen: screens.DebugMenu, linking: LINK_PATHS.DebugMenu },
              },
            },
          }),
    },
    screens: {
      NotFound: { screen: screens.NotFound, linking: '*' },
    },
  });

  return createStaticNavigation(RootStack);
}
