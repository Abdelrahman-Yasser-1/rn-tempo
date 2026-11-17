import { useTranslation } from 'react-i18next';

import { Button, Radio, RadioGroup, Row, Text, TextField } from '@shared/components';

import { useApiSourceControls } from './useApiSourceControls';

const OPTIONS = [
  { source: 'env', labelKey: 'debug.apiSource.env' },
  { source: 'mocks', labelKey: 'debug.apiSource.mocks' },
  { source: 'dev-api', labelKey: 'debug.apiSource.devApi' },
] as const;

/**
 * Dev builds only: where the app's requests go (the build's env setting, the in-app mocks or the
 * local dev API). Loaded through a guarded `require` in `DebugMenuScreen`, so release bundles never
 * contain it.
 */
export function ApiSourceControls() {
  const { t } = useTranslation('app');
  const vm = useApiSourceControls();

  return (
    <>
      <RadioGroup
        accessibilityLabel={t('debug.apiSource.title')}
        onChange={vm.onSourceChange}
        testID="debug-menu.api-source"
        value={vm.source}
      >
        {OPTIONS.map((option) => (
          <Radio
            key={option.source}
            label={t(option.labelKey)}
            testID={`debug-menu.api-source.${option.source}`}
            value={option.source}
          />
        ))}
      </RadioGroup>
      {vm.source === 'dev-api' ? (
        <>
          <TextField
            accessibilityLabel={t('debug.apiSource.urlLabel')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={vm.onUrlChange}
            placeholder={vm.defaultUrl}
            testID="debug-menu.dev-api-url-input"
            value={vm.url}
          />
          <Row gap="sm" wrap>
            <Button
              onPress={vm.onUrlSave}
              testID="debug-menu.dev-api-url-save"
              title={t('debug.apiSource.save')}
            />
            <Button
              onPress={vm.onUrlReset}
              testID="debug-menu.dev-api-url-reset"
              title={t('debug.apiSource.reset')}
              variant="secondary"
            />
          </Row>
        </>
      ) : null}
      <Text color="textSecondary" variant="caption">
        {t('debug.apiSource.hint')}
      </Text>
      {vm.isSaved ? (
        <Text color="success" testID="debug-menu.api-source-saved" variant="label">
          {t('debug.apiSource.saved')}
        </Text>
      ) : null}
    </>
  );
}
