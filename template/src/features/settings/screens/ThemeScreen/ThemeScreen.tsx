import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import type { SettingsStackParamList } from '@navigation/types';
import { Header, Radio, RadioGroup, Screen } from '@shared/components';
import { useAppTheme, type ThemePreference } from '@theme/index';

import { THEME_OPTIONS } from '../../constants';

import { styles } from './styles';

const isThemePreference = (value: string): value is ThemePreference =>
  THEME_OPTIONS.some((option) => option === value);

export function ThemeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList, 'Theme'>>();
  const { t } = useTranslation('settings');
  const { preference, setPreference } = useAppTheme();

  const themeNames = { system: t('theme.system'), light: t('theme.light'), dark: t('theme.dark') };

  const handleChange = (value: string) => {
    if (isThemePreference(value)) {
      setPreference(value);
    }
  };

  return (
    <Screen preset="scroll" contentContainerStyle={styles.content} testID="theme-screen">
      <Header title={t('theme.title')} onBack={navigation.goBack} testID="theme.header" />
      <RadioGroup
        value={preference}
        onChange={handleChange}
        accessibilityLabel={t('theme.title')}
        testID="theme.group"
      >
        {THEME_OPTIONS.map((option) => (
          <Radio
            key={option}
            value={option}
            label={themeNames[option]}
            testID={`theme.option-${option}`}
          />
        ))}
      </RadioGroup>
    </Screen>
  );
}
