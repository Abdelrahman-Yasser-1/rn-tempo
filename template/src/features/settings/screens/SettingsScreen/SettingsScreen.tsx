import { useTranslation } from 'react-i18next';

import { CrashReportsRow } from '@features/settings/components/CrashReportsRow';
import { NotificationsRow } from '@features/settings/components/NotificationsRow'; // @tempo-feature:push-notifications
import { getNativeName } from '@services/i18n/languages';
import { Dialog, Header, Icon, ListItem, Screen } from '@shared/components';

import { styles } from './styles';
import { useSettingsScreen } from './useSettingsScreen';

export function SettingsScreen() {
  const { t } = useTranslation('settings');
  const vm = useSettingsScreen();

  const themeNames = { system: t('theme.system'), light: t('theme.light'), dark: t('theme.dark') };

  const textSizeNames = {
    small: t('textSize.small'),
    default: t('textSize.default'),
    large: t('textSize.large'),
    extraLarge: t('textSize.extraLarge'),
  };

  return (
    <Screen preset="scroll" contentContainerStyle={styles.content} testID="settings-screen">
      <Header title={t('title')} testID="settings.header" />
      <ListItem
        title={t('language.title')}
        subtitle={getNativeName(vm.language)}
        left={<Icon name="globe" />}
        showChevron
        showDivider
        accessibilityRole="button"
        onPress={vm.onLanguage}
        testID="settings.language"
      />
      <ListItem
        title={t('theme.title')}
        subtitle={themeNames[vm.mode]}
        left={<Icon name="moon" />}
        showChevron
        showDivider
        accessibilityRole="button"
        onPress={vm.onTheme}
        testID="settings.theme"
      />
      <ListItem
        title={t('textSize.title')}
        subtitle={textSizeNames[vm.fontScaleId]}
        left={<Icon name="abc" />}
        showChevron
        showDivider
        accessibilityRole="button"
        onPress={vm.onTextSize}
        testID="settings.text-size"
      />
      <ListItem
        title={t('appIcon.title')}
        subtitle={vm.appIconLabel}
        left={<Icon name="apps" />}
        showChevron
        showDivider
        accessibilityRole="button"
        onPress={vm.onAppIcon}
        testID="settings.app-icon"
      />
      {/* @tempo-feature:push-notifications:start */}
      <NotificationsRow />
      {/* @tempo-feature:push-notifications:end */}
      <CrashReportsRow />
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
