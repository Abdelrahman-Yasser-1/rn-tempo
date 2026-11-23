import { useTranslation } from 'react-i18next';

import { LANGUAGES } from '@services/i18n/languages';
import { Dialog, Header, Radio, RadioGroup, Screen } from '@shared/components';

import { styles } from './styles';
import { useLanguageScreen } from './useLanguageScreen';

export function LanguageScreen() {
  const { t } = useTranslation('settings');
  const vm = useLanguageScreen();

  return (
    <Screen preset="scroll" contentContainerStyle={styles.content} testID="language-screen">
      <Header title={t('language.title')} onBack={vm.onBack} testID="language.header" />
      <RadioGroup
        value={vm.language}
        onChange={vm.onChange}
        accessibilityLabel={t('language.title')}
        testID="language.group"
      >
        {LANGUAGES.map(({ code, nativeName }) => (
          <Radio key={code} value={code} label={nativeName} testID={`language.option-${code}`} />
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
