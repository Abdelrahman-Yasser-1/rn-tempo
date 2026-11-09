import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { APP_VERSION } from '@config/constants';
import { ENV } from '@config/env';
import { Header, ListItem, Screen } from '@shared/components';

import { styles } from './styles';
import { useAboutScreen } from './useAboutScreen';

const { major, minor, patch } = Platform.constants.reactNativeVersion;
const REACT_NATIVE_VERSION = `${String(major)}.${String(minor)}.${String(patch)}`;

export function AboutScreen() {
  const { t } = useTranslation('settings');
  const vm = useAboutScreen();

  return (
    <Screen preset="scroll" contentContainerStyle={styles.content} testID="about-screen">
      <Header title={t('about.title')} onBack={vm.onBack} testID="about.header" />
      <ListItem
        title={t('about.version')}
        subtitle={APP_VERSION}
        showDivider
        onPress={vm.onVersionPress}
        testID="about.version"
      />
      <ListItem
        title={t('about.environment')}
        subtitle={ENV.APP_ENV}
        showDivider
        testID="about.environment"
      />
      <ListItem
        title={t('about.reactNative')}
        subtitle={REACT_NATIVE_VERSION}
        showDivider
        testID="about.react-native"
      />
      <ListItem
        title={t('about.os')}
        subtitle={`${Platform.OS} ${String(Platform.Version)}`}
        testID="about.os"
      />
    </Screen>
  );
}
