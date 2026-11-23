import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { TEXT_SIZE_OPTIONS } from '@features/settings/constants';
import type { SettingsStackParamList } from '@navigation/types';
import { parseFontScale, useAppTheme } from '@theme/index';

/** Logic of the text size screen: the current scale and validated changes. */
export function useTextSizeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList, 'TextSize'>>();
  const { fontScale, setFontScale } = useAppTheme();

  const onChange = (value: string) => {
    const scale = parseFontScale(value);
    if (scale !== undefined) {
      setFontScale(scale);
    }
  };

  return {
    value: String(fontScale),
    options: TEXT_SIZE_OPTIONS,
    onChange,
    onBack: navigation.goBack,
  };
}
