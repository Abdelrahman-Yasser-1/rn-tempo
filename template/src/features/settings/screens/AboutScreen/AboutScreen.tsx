import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { APP_VERSION } from '@config/constants';
import { ENV, isProd } from '@config/env';
import { navigationRef } from '@navigation/navigationRef';
import type { SettingsStackParamList } from '@navigation/types';
import { Header, ListItem, Screen } from '@shared/components';

import { useSecretTap } from '../../hooks/useSecretTap';

import { styles } from './styles';

const { major, minor, patch } = Platform.constants.reactNativeVersion;
const REACT_NATIVE_VERSION = `${String(major)}.${String(minor)}.${String(patch)}`;

const openDebugMenu = () => {
  if (!isProd && navigationRef.isReady()) {
    navigationRef.navigate('DebugMenu');
  }
};

export function AboutScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList, 'About'>>();
  const { t } = useTranslation('settings');
  const handleVersionPress = useSecretTap(openDebugMenu);

  return (
    <Screen preset="scroll" contentContainerStyle={styles.content} testID="about-screen">
      <Header title={t('about.title')} onBack={navigation.goBack} testID="about.header" />
      <ListItem
        title={t('about.version')}
        subtitle={APP_VERSION}
        showDivider
        onPress={handleVersionPress}
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
