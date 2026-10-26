import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { ComponentType } from 'react';

import { i18n } from '@services/i18n/i18n';

import { createHomeStack, createProfileStack, createSettingsStack } from './stacks';

/**
 * Three tabs, each with its own stack. Tabs show text labels only; options are functions so labels
 * are translated at render time (after i18n init), not at module load.
 * WS4 (task 4.x): add `tabBarIcon` using the shared Icon component.
 */
export function createMainTabs(placeholder: ComponentType) {
  return createBottomTabNavigator({
    screenOptions: { headerShown: false },
    screens: {
      HomeTab: {
        screen: createHomeStack(placeholder),
        options: () => ({ tabBarLabel: i18n.t('tabs.home', { ns: 'app' }) }),
      },
      ProfileTab: {
        screen: createProfileStack(placeholder),
        options: () => ({ tabBarLabel: i18n.t('tabs.profile', { ns: 'app' }) }),
      },
      SettingsTab: {
        screen: createSettingsStack(placeholder),
        options: () => ({ tabBarLabel: i18n.t('tabs.settings', { ns: 'app' }) }),
      },
    },
  });
}
