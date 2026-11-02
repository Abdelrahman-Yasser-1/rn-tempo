import { useTranslation } from 'react-i18next';

import { Dialog, Header, Icon, ListItem, Screen } from '@shared/components';

import { styles } from './styles';
import { useSettingsScreen } from './useSettingsScreen';

export function SettingsScreen() {
  const { t } = useTranslation('settings');
  const vm = useSettingsScreen();

  const languageNames = { en: t('language.english'), ar: t('language.arabic') };
  const themeNames = { system: t('theme.system'), light: t('theme.light'), dark: t('theme.dark') };

  return (
    <Screen preset="scroll" contentContainerStyle={styles.content} testID="settings-screen">
      <Header title={t('title')} testID="settings.header" />
      <ListItem
        title={t('language.title')}
        subtitle={languageNames[vm.language]}
        left={<Icon name="globe" />}
        showChevron
        showDivider
        accessibilityRole="button"
        onPress={vm.onLanguage}
        testID="settings.language"
      />
      <ListItem
        title={t('theme.title')}
        subtitle={themeNames[vm.preference]}
        left={<Icon name="moon" />}
        showChevron
        showDivider
        accessibilityRole="button"
        onPress={vm.onTheme}
        testID="settings.theme"
      />
      <ListItem
        title={t('about.title')}
        left={<Icon name="info" />}
        showChevron
        showDivider
        accessibilityRole="button"
        onPress={vm.onAbout}
        testID="settings.about"
      />
      <ListItem
        title={t('logout.title')}
        left={<Icon name="logout" color="error" />}
        accessibilityRole="button"
        onPress={vm.onLogoutPress}
        testID="settings.logout"
      />
      <Dialog
        visible={vm.isLogoutVisible}
        title={t('logout.dialogTitle')}
        message={t('logout.dialogMessage')}
        confirmLabel={t('logout.confirm')}
        destructive
        onConfirm={vm.onLogoutConfirm}
        onCancel={vm.onLogoutCancel}
        testID="settings.logout-dialog"
      />
    </Screen>
  );
}
