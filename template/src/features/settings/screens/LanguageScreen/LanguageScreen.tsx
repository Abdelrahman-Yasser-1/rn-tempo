import { useTranslation } from 'react-i18next';

import { LANGUAGE_OPTIONS } from '@features/settings/constants';
import { Dialog, Header, Radio, RadioGroup, Screen } from '@shared/components';

import { styles } from './styles';
import { useLanguageScreen } from './useLanguageScreen';

export function LanguageScreen() {
  const { t } = useTranslation('settings');
  const vm = useLanguageScreen();

  const languageNames = { en: t('language.english'), ar: t('language.arabic') };

  return (
    <Screen preset="scroll" contentContainerStyle={styles.content} testID="language-screen">
      <Header title={t('language.title')} onBack={vm.onBack} testID="language.header" />
      <RadioGroup
        value={vm.language}
        onChange={vm.onChange}
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
        visible={vm.isConfirmVisible}
        title={t('language.restartTitle')}
        message={t('language.restartMessage')}
        onConfirm={vm.onConfirm}
        onCancel={vm.onCancel}
        testID="language.dialog"
      />
    </Screen>
  );
}
