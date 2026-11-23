import { useTranslation } from 'react-i18next';

import { Header, Radio, RadioGroup, Screen, Text } from '@shared/components';

import { styles } from './styles';
import { useTextSizeScreen } from './useTextSizeScreen';

export function TextSizeScreen() {
  const { t } = useTranslation('settings');
  const vm = useTextSizeScreen();

  const sizeNames = {
    small: t('textSize.small'),
    default: t('textSize.default'),
    large: t('textSize.large'),
    extraLarge: t('textSize.extraLarge'),
  };

  return (
    <Screen preset="scroll" contentContainerStyle={styles.content} testID="text-size-screen">
      <Header title={t('textSize.title')} onBack={vm.onBack} testID="text-size.header" />
      <RadioGroup
        value={vm.value}
        onChange={vm.onChange}
        accessibilityLabel={t('textSize.title')}
        testID="text-size.group"
      >
        {vm.options.map((option) => (
          <Radio
            key={option.id}
            value={String(option.scale)}
            label={sizeNames[option.id]}
            testID={`text-size.option-${option.id}`}
          />
        ))}
      </RadioGroup>
      <Text variant="body" style={styles.preview} testID="text-size.preview">
        {t('textSize.preview')}
      </Text>
    </Screen>
  );
}
