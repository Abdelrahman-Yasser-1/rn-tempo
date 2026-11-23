import { useTranslation } from 'react-i18next';
import { Platform, type ImageRequireSource } from 'react-native';

import { Header, Image, Radio, RadioGroup, Screen, Text } from '@shared/components';
import { spacing } from '@theme/tokens';

import { styles } from './styles';
import { useAppIconScreen } from './useAppIconScreen';

/* eslint-disable @typescript-eslint/no-require-imports -- Metro resolves bundled PNGs from static require calls, as in the image registry. */
const previews = {
  default: require('@assets/icons-source/previews/default.png') as ImageRequireSource,
  ocean: require('@assets/icons-source/previews/ocean.png') as ImageRequireSource,
  forest: require('@assets/icons-source/previews/forest.png') as ImageRequireSource,
  sunset: require('@assets/icons-source/previews/sunset.png') as ImageRequireSource,
};
/* eslint-enable @typescript-eslint/no-require-imports -- end of bundled PNG imports */

export function AppIconScreen() {
  const { t } = useTranslation('settings');
  const vm = useAppIconScreen();

  return (
    <Screen preset="scroll" contentContainerStyle={styles.content} testID="app-icon-screen">
      <Header title={t('appIcon.title')} onBack={vm.onBack} testID="app-icon.header" />
      {vm.isSupported ? (
        <>
          <RadioGroup
            value={vm.value}
            onChange={vm.onChange}
            disabled={vm.disabled}
            accessibilityLabel={t('appIcon.title')}
            testID="app-icon.group"
          >
            {vm.options.map((name) => (
              <Radio
                key={name}
                value={name}
                label={vm.names[name]}
                leading={
                  <Image
                    source={previews[name]}
                    width={spacing.xxl}
                    height={spacing.xxl}
                    radius="sm"
                    testID={`app-icon.preview-${name}`}
                  />
                }
                testID={`app-icon.option-${name}`}
              />
            ))}
          </RadioGroup>
          {Platform.OS === 'android' && (
            <Text variant="bodySmall" color="textSecondary">
              {t('appIcon.androidNote')}
            </Text>
          )}
        </>
      ) : (
        <Text>{t('appIcon.unsupported')}</Text>
      )}
    </Screen>
  );
}
