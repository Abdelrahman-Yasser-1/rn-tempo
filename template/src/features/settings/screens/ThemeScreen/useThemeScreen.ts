import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { THEME_OPTIONS } from '@features/settings/constants';
import type { SettingsStackParamList } from '@navigation/types';
import { useAppTheme, type ThemeModePreference } from '@theme/index';

const isThemeModePreference = (value: string): value is ThemeModePreference =>
  THEME_OPTIONS.some((option) => option === value);

/** Logic of the theme screen: current mode and validated changes. */
export function useThemeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList, 'Theme'>>();
  const { mode, setMode } = useAppTheme();

  const onChange = (value: string) => {
    if (isThemeModePreference(value)) {
      setMode(value);
    }
  };

  return { mode, onChange, onBack: navigation.goBack };
}
