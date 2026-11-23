import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { THEME_OPTIONS } from '@features/settings/constants';
import type { SettingsStackParamList } from '@navigation/types';
import {
  PALETTE_NAMES,
  useAppTheme,
  type ThemeModePreference,
  type ThemePalette,
} from '@theme/index';

const isThemeModePreference = (value: string): value is ThemeModePreference =>
  THEME_OPTIONS.some((option) => option === value);

const isThemePalette = (value: string): value is ThemePalette =>
  PALETTE_NAMES.some((name) => name === value);

/** Logic of the theme screen: current mode and validated changes. */
export function useThemeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList, 'Theme'>>();
  const { mode, palette, theme, setMode, setPalette } = useAppTheme();

  const onChange = (value: string) => {
    if (isThemeModePreference(value)) {
      setMode(value);
    }
  };

  const onPaletteChange = (value: string) => {
    if (isThemePalette(value)) {
      setPalette(value);
    }
  };

  return {
    mode,
    palette,
    themeMode: theme.name,
    onChange,
    onPaletteChange,
    onBack: navigation.goBack,
  };
}
