import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';

import type { SettingsStackParamList } from '@navigation/types';
import { isSupportedLanguage, type Language } from '@services/i18n/languageManager';
import { useLanguage } from '@services/i18n/useLanguage';

/** Logic of the language screen: pending selection, restart confirmation and apply. */
export function useLanguageScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList, 'Language'>>();
  const { language, setLanguage } = useLanguage();
  const [pending, setPending] = useState<Language | null>(null);

  const onChange = (value: string) => {
    if (isSupportedLanguage(value) && value !== language) {
      setPending(value);
    }
  };

  const onConfirm = () => {
    if (pending !== null) {
      void setLanguage(pending);
    }
    setPending(null);
  };

  const onCancel = () => {
    setPending(null);
  };

  return {
    language,
    isConfirmVisible: pending !== null,
    onChange,
    onConfirm,
    onCancel,
    onBack: navigation.goBack,
  };
}
