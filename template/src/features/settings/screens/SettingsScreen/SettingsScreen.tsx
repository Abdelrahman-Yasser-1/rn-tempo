import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useLogout } from '@features/auth';
import type { SettingsStackParamList } from '@navigation/types';
import { useLanguage } from '@services/i18n/useLanguage';
import { Dialog, Header, Icon, ListItem, Screen } from '@shared/components';
import { useAppTheme } from '@theme/index';

import { styles } from './styles';

type SettingsScreenProps = Readonly<NativeStackScreenProps<SettingsStackParamList, 'Settings'>>;

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const { t } = useTranslation('settings');
  const { language } = useLanguage();
  const { preference } = useAppTheme();
  const logout = useLogout();
  const [isLogoutVisible, setIsLogoutVisible] = useState(false);

  const languageNames = { en: t('language.english'), ar: t('language.arabic') };
  const themeNames = { system: t('theme.system'), light: t('theme.light'), dark: t('theme.dark') };

  return (
    <Screen preset="scroll" contentContainerStyle={styles.content} testID="settings-screen">
      <Header title={t('title')} testID="settings.header" />
      <ListItem
        title={t('language.title')}
        subtitle={languageNames[language]}
        left={<Icon name="globe" />}
        showChevron
        showDivider
        accessibilityRole="button"
        onPress={() => {
          navigation.navigate('Language');
        }}
        testID="settings.language"
      />
      <ListItem
        title={t('theme.title')}
        subtitle={themeNames[preference]}
        left={<Icon name="moon" />}
        showChevron
        showDivider
        accessibilityRole="button"
        onPress={() => {
          navigation.navigate('Theme');
        }}
        testID="settings.theme"
      />
      <ListItem
        title={t('about.title')}
        left={<Icon name="info" />}
        showChevron
        showDivider
        accessibilityRole="button"
        onPress={() => {
          navigation.navigate('About');
        }}
        testID="settings.about"
      />
      <ListItem
        title={t('logout.title')}
        left={<Icon name="logout" color="error" />}
        accessibilityRole="button"
        onPress={() => {
          setIsLogoutVisible(true);
        }}
        testID="settings.logout"
      />
      <Dialog
        visible={isLogoutVisible}
        title={t('logout.dialogTitle')}
        message={t('logout.dialogMessage')}
        confirmLabel={t('logout.confirm')}
        destructive
        onConfirm={() => {
          setIsLogoutVisible(false);
          void logout();
        }}
        onCancel={() => {
          setIsLogoutVisible(false);
        }}
        testID="settings.logout-dialog"
      />
    </Screen>
  );
}
