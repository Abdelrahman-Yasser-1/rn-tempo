/* eslint-disable no-restricted-imports -- WS4 (task 4.x): replace RN primitives with shared Text, Button, Switch and TextField */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { APP_BUNDLE_ID, APP_VERSION } from '@config/constants';
import { ENV } from '@config/env';
import { useAuthStore } from '@features/auth';
import { clearFlagOverrides, setFlagOverride } from '@services/flags/flagOverrides';
import { FLAG_DEFAULTS, type FlagKey } from '@services/flags/flags';
import { useFeatureFlag } from '@services/flags/useFeatureFlag';
import { resolveBaseUrl } from '@services/http/client';
import { queryClient } from '@services/http/queryClient';
import { STORAGE_KEYS } from '@services/storage/keys';
import { storage } from '@services/storage/storage';

import { styles } from './styles';

const FLAG_KEYS = Object.keys(FLAG_DEFAULTS) as FlagKey[];
const BUNDLE_SUFFIX: Record<typeof ENV.APP_ENV, string> = {
  dev: '.dev',
  staging: '.staging',
  prod: '',
};

type SectionProps = { title: string; children: ReactNode };

function Section({ title, children }: Readonly<SectionProps>) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
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
      <Text style={styles.label}>{label}</Text>
      <Text selectable style={styles.value}>
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
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.button, isSecondary && styles.buttonSecondary]}
      testID={testID}
    >
      <Text style={[styles.buttonLabel, isSecondary && styles.buttonLabelSecondary]}>{label}</Text>
    </Pressable>
  );
}

function FlagRow({ flag }: Readonly<{ flag: FlagKey }>) {
  const isEnabled = useFeatureFlag(flag);
  return (
    <View style={styles.row}>
      <Text style={styles.value}>{flag}</Text>
      <Switch
        accessibilityLabel={flag}
        onValueChange={(isOn) => {
          setFlagOverride(flag, isOn);
        }}
        testID={`debug-menu.flag.${flag}`}
        value={isEnabled}
      />
    </View>
  );
}

/** Non-prod only. Environment info, API URL override, flag overrides and data reset tools. */
export function DebugMenuScreen() {
  const { t } = useTranslation('app');
  const [apiUrl, setApiUrl] = useState(storage.getString(STORAGE_KEYS.apiBaseUrlOverride) ?? '');
  const [doneMessage, setDoneMessage] = useState('');
  const markDone = (): void => {
    setDoneMessage(t('debug.done'));
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={styles.container}
      testID="debug-menu-screen"
    >
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
        <TextInput
          accessibilityLabel={t('debug.apiUrl.title')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onChangeText={setApiUrl}
          placeholder={ENV.API_BASE_URL}
          style={styles.input}
          testID="debug-menu.api-url-input"
          value={apiUrl}
        />
        <Text style={styles.hint}>{t('debug.apiUrl.hint')}</Text>
        <View style={styles.buttons}>
          <Action
            label={t('debug.apiUrl.save')}
            onPress={() => {
              const trimmed = apiUrl.trim();
              if (trimmed === '') {
                storage.remove(STORAGE_KEYS.apiBaseUrlOverride);
              } else {
                storage.setString(STORAGE_KEYS.apiBaseUrlOverride, trimmed);
              }
              markDone();
            }}
            testID="debug-menu.api-url-save"
          />
          <Action
            isSecondary
            label={t('debug.apiUrl.clear')}
            onPress={() => {
              storage.remove(STORAGE_KEYS.apiBaseUrlOverride);
              setApiUrl('');
              markDone();
            }}
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
            onPress={clearFlagOverrides}
            testID="debug-menu.flags-reset"
          />
        </View>
      </Section>

      <Section title={t('debug.data.title')}>
        <View style={styles.buttons}>
          <Action
            label={t('debug.data.clearStorage')}
            onPress={() => {
              storage.clearAll();
              markDone();
            }}
            testID="debug-menu.clear-storage"
          />
          <Action
            label={t('debug.data.clearQueryCache')}
            onPress={() => {
              queryClient.clear();
              markDone();
            }}
            testID="debug-menu.clear-query-cache"
          />
          <Action
            label={t('debug.data.clearTokens')}
            onPress={() => {
              void useAuthStore.getState().signOut();
              markDone();
            }}
            testID="debug-menu.clear-tokens"
          />
        </View>
        {doneMessage === '' ? null : <Text style={styles.done}>{doneMessage}</Text>}
      </Section>

      {/* @tempo-feature:storybook:start */}
      <Section title={t('debug.storybook.title')}>
        <Text style={styles.hint}>{t('debug.storybook.hint')}</Text>
      </Section>
      {/* @tempo-feature:storybook:end */}

      <Section title={t('debug.pushToken.title')}>
        <Text style={styles.hint}>{t('debug.pushToken.placeholder')}</Text>
      </Section>
    </ScrollView>
  );
}
