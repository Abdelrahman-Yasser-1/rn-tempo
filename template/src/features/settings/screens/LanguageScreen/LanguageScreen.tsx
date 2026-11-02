import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { SettingsStackParamList } from '@navigation/types';
import { isSupportedLanguage, type Language } from '@services/i18n/languageManager';
import { useLanguage } from '@services/i18n/useLanguage';
import { Dialog, Header, Radio, RadioGroup, Screen } from '@shared/components';

import { LANGUAGE_OPTIONS } from '../../constants';

import { styles } from './styles';

type LanguageScreenProps = Readonly<NativeStackScreenProps<SettingsStackParamList, 'Language'>>;

export function LanguageScreen({ navigation }: LanguageScreenProps) {
  const { t } = useTranslation('settings');
  const { language, setLanguage } = useLanguage();
  const [pending, setPending] = useState<Language | null>(null);

  const languageNames = { en: t('language.english'), ar: t('language.arabic') };

  const handleChange = (value: string) => {
    if (isSupportedLanguage(value) && value !== language) {
      setPending(value);
    }
  };

  const handleConfirm = () => {
    if (pending !== null) {
      void setLanguage(pending);
    }
    setPending(null);
  };

  return (
    <Screen preset="scroll" contentContainerStyle={styles.content} testID="language-screen">
      <Header title={t('language.title')} onBack={navigation.goBack} testID="language.header" />
      <RadioGroup
        value={language}
        onChange={handleChange}
        accessibilityLabel={t('language.title')}
        testID="language.group"
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <Radio
            key={option}
            value={option}
            label={languageNames[option]}
            testID={`language.option-${option}`}
          />
        ))}
      </RadioGroup>
      <Dialog
        visible={pending !== null}
        title={t('language.restartTitle')}
        message={t('language.restartMessage')}
        onConfirm={handleConfirm}
        onCancel={() => {
          setPending(null);
        }}
        testID="language.dialog"
      />
    </Screen>
  );
}
