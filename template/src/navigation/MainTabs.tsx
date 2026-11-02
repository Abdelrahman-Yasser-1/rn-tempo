import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { ComponentType } from 'react';

import { i18n } from '@services/i18n/i18n';
import { Icon } from '@shared/components';

import { createHomeStack, createProfileStack, createSettingsStack } from './stacks';

/**
 * Three tabs, each with its own stack. Options are functions so labels are translated at render
 * time (after i18n init), not at module load.
 */
export function createMainTabs(placeholder: ComponentType) {
  return createBottomTabNavigator({
    screenOptions: { headerShown: false },
    screens: {
      HomeTab: {
        screen: createHomeStack(placeholder),
        options: () => ({
          tabBarLabel: i18n.t('tabs.home', { ns: 'app' }),
          tabBarIcon: ({ focused: isFocused }) => (
            <Icon name="home" color={isFocused ? 'primary' : 'textSecondary'} />
          ),
        }),
      },
      ProfileTab: {
        screen: createProfileStack(),
        options: () => ({
          tabBarLabel: i18n.t('tabs.profile', { ns: 'app' }),
          tabBarIcon: ({ focused: isFocused }) => (
            <Icon name="user" color={isFocused ? 'primary' : 'textSecondary'} />
          ),
        }),
      },
      SettingsTab: {
        screen: createSettingsStack(),
        options: () => ({
          tabBarLabel: i18n.t('tabs.settings', { ns: 'app' }),
          tabBarIcon: ({ focused: isFocused }) => (
            <Icon name="settings" color={isFocused ? 'primary' : 'textSecondary'} />
          ),
        }),
      },
    },
  });
}
