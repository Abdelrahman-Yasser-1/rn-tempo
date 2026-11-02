import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';

import { APP_BUNDLE_ID, APP_VERSION } from '@config/constants';
import { ENV } from '@config/env';
import type { FlagKey } from '@services/flags/flags';
import { resolveBaseUrl } from '@services/http/client';
import { Button, Screen, Switch, Text, TextField } from '@shared/components';

import { styles } from './styles';
import { FLAG_KEYS, useDebugFlag, useDebugMenuScreen } from './useDebugMenuScreen';

const BUNDLE_SUFFIX: Record<typeof ENV.APP_ENV, string> = {
  dev: '.dev',
  staging: '.staging',
  prod: '',
};

type SectionProps = { title: string; children: ReactNode };

function Section({ title, children }: Readonly<SectionProps>) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" variant="title">
        {title}
      </Text>
      {children}
    </View>
  );
}

type InfoRowProps = { label: string; value: string };

function InfoRow({ label, value }: Readonly<InfoRowProps>) {
  return (
    <View style={styles.row}>
      <Text color="textSecondary" variant="bodySmall">
        {label}
      </Text>
      <Text selectable style={styles.value} variant="label">
        {value}
      </Text>
    </View>
  );
}

type ActionProps = {
  label: string;
  onPress: () => void;
  testID: string;
  isSecondary?: boolean;
};

function Action({ label, onPress, testID, isSecondary = false }: Readonly<ActionProps>) {
  return (
    <Button
      onPress={onPress}
      testID={testID}
      title={label}
      variant={isSecondary ? 'secondary' : 'primary'}
    />
  );
}

function FlagRow({ flag }: Readonly<{ flag: FlagKey }>) {
  const { isEnabled, onChange } = useDebugFlag(flag);
  return (
    <View style={styles.row}>
      <Switch
        label={flag}
        onValueChange={onChange}
        testID={`debug-menu.flag.${flag}`}
        value={isEnabled}
      />
    </View>
  );
}

/** Non-prod only. Environment info, API URL override, flag overrides and data reset tools. */
export function DebugMenuScreen() {
  const { t } = useTranslation('app');
  const vm = useDebugMenuScreen();

  return (
    <Screen contentContainerStyle={styles.content} preset="scroll" testID="debug-menu-screen">
      <Section title={t('debug.env.title')}>
        <InfoRow label={t('debug.env.appEnv')} value={ENV.APP_ENV} />
        <InfoRow label={t('debug.env.version')} value={APP_VERSION} />
        <InfoRow
          label={t('debug.env.platform')}
          value={`${Platform.OS} ${String(Platform.Version)}`}
        />
        <InfoRow
          label={t('debug.env.bundleId')}
          value={`${APP_BUNDLE_ID}${BUNDLE_SUFFIX[ENV.APP_ENV]}`}
        />
        <InfoRow label={t('debug.env.apiBaseUrl')} value={resolveBaseUrl()} />
      </Section>

      <Section title={t('debug.apiUrl.title')}>
        <TextField
          accessibilityLabel={t('debug.apiUrl.title')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onChangeText={vm.onApiUrlChange}
          placeholder={ENV.API_BASE_URL}
          testID="debug-menu.api-url-input"
          value={vm.apiUrl}
        />
        <Text color="textSecondary" variant="caption">
          {t('debug.apiUrl.hint')}
        </Text>
        <View style={styles.buttons}>
          <Action
            label={t('debug.apiUrl.save')}
            onPress={vm.onApiUrlSave}
            testID="debug-menu.api-url-save"
          />
          <Action
            isSecondary
            label={t('debug.apiUrl.clear')}
            onPress={vm.onApiUrlClear}
            testID="debug-menu.api-url-clear"
          />
        </View>
      </Section>

      <Section title={t('debug.flags.title')}>
        {FLAG_KEYS.map((flag) => (
          <FlagRow flag={flag} key={flag} />
        ))}
        <View style={styles.buttons}>
          <Action
            isSecondary
            label={t('debug.flags.reset')}
            onPress={vm.onResetFlags}
            testID="debug-menu.flags-reset"
          />
        </View>
      </Section>

      <Section title={t('debug.data.title')}>
        <View style={styles.buttons}>
          <Action
            label={t('debug.data.clearStorage')}
            onPress={vm.onClearStorage}
            testID="debug-menu.clear-storage"
          />
          <Action
            label={t('debug.data.clearQueryCache')}
            onPress={vm.onClearQueryCache}
            testID="debug-menu.clear-query-cache"
          />
          <Action
            label={t('debug.data.clearTokens')}
            onPress={vm.onClearTokens}
            testID="debug-menu.clear-tokens"
          />
        </View>
        {vm.doneMessage === '' ? null : (
          <Text color="success" variant="label">
            {vm.doneMessage}
          </Text>
        )}
      </Section>

      {/* @tempo-feature:storybook:start */}
      <Section title={t('debug.storybook.title')}>
        <Text color="textSecondary" variant="caption">
          {t('debug.storybook.hint')}
        </Text>
      </Section>
      {/* @tempo-feature:storybook:end */}

      <Section title={t('debug.pushToken.title')}>
        <Text color="textSecondary" variant="caption">
          {t('debug.pushToken.placeholder')}
        </Text>
      </Section>
    </Screen>
  );
}
