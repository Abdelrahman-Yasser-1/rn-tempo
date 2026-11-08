import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { THEME_OPTIONS } from '@features/settings/constants';
import type { SettingsStackParamList } from '@navigation/types';
import { useAppTheme, type ThemePreference } from '@theme/index';

const isThemePreference = (value: string): value is ThemePreference =>
  THEME_OPTIONS.some((option) => option === value);

/** Logic of the theme screen: current preference and validated changes. */
export function useThemeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList, 'Theme'>>();
  const { preference, setPreference } = useAppTheme();

  const onChange = (value: string) => {
    if (isThemePreference(value)) {
      setPreference(value);
    }
  };

  return { preference, onChange, onBack: navigation.goBack };
}
