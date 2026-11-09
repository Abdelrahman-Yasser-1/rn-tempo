import { useTranslation } from 'react-i18next';

import { THEME_OPTIONS } from '@features/settings/constants';
import { Header, Radio, RadioGroup, Screen } from '@shared/components';

import { styles } from './styles';
import { useThemeScreen } from './useThemeScreen';

export function ThemeScreen() {
  const { t } = useTranslation('settings');
  const vm = useThemeScreen();

  const themeNames = {
    system: t(($) => $.theme.system),
    light: t(($) => $.theme.light),
    dark: t(($) => $.theme.dark),
  };

  return (
    <Screen preset="scroll" contentContainerStyle={styles.content} testID="theme-screen">
      <Header title={t(($) => $.theme.title)} onBack={vm.onBack} testID="theme.header" />
      <RadioGroup
        value={vm.preference}
        onChange={vm.onChange}
        accessibilityLabel={t(($) => $.theme.title)}
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
