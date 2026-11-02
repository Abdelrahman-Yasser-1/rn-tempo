import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';

import { useLogout } from '@features/auth';
import type { SettingsStackParamList } from '@navigation/types';
import { useLanguage } from '@services/i18n/useLanguage';
import { useAppTheme } from '@theme/index';

/** Logic of the settings screen: current language/theme, section navigation and logout dialog. */
export function useSettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList, 'Settings'>>();
  const { language } = useLanguage();
  const { preference } = useAppTheme();
  const logout = useLogout();
  const [isLogoutVisible, setIsLogoutVisible] = useState(false);

  const onLanguage = () => {
    navigation.navigate('Language');
  };

  const onTheme = () => {
    navigation.navigate('Theme');
  };

  const onAbout = () => {
    navigation.navigate('About');
  };

  const onLogoutPress = () => {
    setIsLogoutVisible(true);
  };

  const onLogoutCancel = () => {
    setIsLogoutVisible(false);
  };

  const onLogoutConfirm = () => {
    setIsLogoutVisible(false);
    void logout();
  };

  return {
    language,
    preference,
    isLogoutVisible,
    onLanguage,
    onTheme,
    onAbout,
    onLogoutPress,
    onLogoutCancel,
    onLogoutConfirm,
  };
}
