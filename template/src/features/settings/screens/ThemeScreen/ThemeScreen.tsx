import { useTranslation } from 'react-i18next';

import { THEME_OPTIONS } from '@features/settings/constants';
import { Box, Header, Radio, RadioGroup, Screen, Text } from '@shared/components';
import { appThemes, PALETTE_NAMES, themeKey } from '@theme/index';

import { styles } from './styles';
import { useThemeScreen } from './useThemeScreen';

export function ThemeScreen() {
  const { t } = useTranslation('settings');
  const vm = useThemeScreen();

  const themeNames = { system: t('theme.system'), light: t('theme.light'), dark: t('theme.dark') };
  const paletteNames = {
    default: t('theme.palette.default'),
    ocean: t('theme.palette.ocean'),
    forest: t('theme.palette.forest'),
    sunset: t('theme.palette.sunset'),
  };

  return (
    <Screen preset="scroll" contentContainerStyle={styles.content} testID="theme-screen">
      <Header title={t('theme.title')} onBack={vm.onBack} testID="theme.header" />
      <Text variant="title" accessibilityRole="header">
        {t('theme.mode')}
      </Text>
      <RadioGroup
        value={vm.mode}
        onChange={vm.onChange}
        accessibilityLabel={t('theme.mode')}
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
      <Text variant="title" accessibilityRole="header">
        {t('theme.palette.title')}
      </Text>
      <RadioGroup
        value={vm.palette}
        onChange={vm.onPaletteChange}
        accessibilityLabel={t('theme.palette.title')}
        testID="theme.palette-group"
      >
        {PALETTE_NAMES.map((name) => (
          <Radio
            key={name}
            value={name}
            label={paletteNames[name]}
            leading={
              <Box
                style={styles.swatch(appThemes[themeKey(name, vm.themeMode)].colors.primary)}
                testID={`theme.palette-swatch-${name}`}
              />
            }
            testID={`theme.palette-${name}`}
          />
        ))}
      </RadioGroup>
    </Screen>
  );
}
