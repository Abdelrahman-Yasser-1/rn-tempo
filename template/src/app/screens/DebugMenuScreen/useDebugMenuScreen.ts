import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuthStore } from '@features/auth';
import type { RootStackParamList } from '@navigation/types';
import { recordError } from '@services/crash-reporting/crashReporting';
import { clearFlagOverrides, setFlagOverride } from '@services/flags/flagOverrides';
import { FLAG_DEFAULTS, type FlagKey } from '@services/flags/flags';
import { useFeatureFlag } from '@services/flags/useFeatureFlag';
import { queryClient } from '@services/http/queryClient';
import { STORAGE_KEYS } from '@services/storage/keys';
import { storage } from '@services/storage/storage';

export const FLAG_KEYS = Object.keys(FLAG_DEFAULTS) as FlagKey[];

/** Logic of one feature-flag switch: the effective value and the override setter. */
export function useDebugFlag(flag: FlagKey) {
  const isEnabled = useFeatureFlag(flag);

  const onChange = (isOn: boolean) => {
    setFlagOverride(flag, isOn);
  };

  return { isEnabled, onChange };
}

/** Logic of the debug menu: API URL override, flag reset and data reset actions. */
export function useDebugMenuScreen() {
  const { t } = useTranslation('app');
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'DebugMenu'>>();
  const [apiUrl, setApiUrl] = useState(storage.getString(STORAGE_KEYS.apiBaseUrlOverride) ?? '');
  const [doneMessage, setDoneMessage] = useState('');

  const markDone = (): void => {
    setDoneMessage(t('debug.done'));
  };

  const onApiUrlSave = () => {
    const trimmed = apiUrl.trim();
    if (trimmed === '') {
      storage.remove(STORAGE_KEYS.apiBaseUrlOverride);
    } else {
      storage.setString(STORAGE_KEYS.apiBaseUrlOverride, trimmed);
    }
    markDone();
  };

  const onApiUrlClear = () => {
    storage.remove(STORAGE_KEYS.apiBaseUrlOverride);
    setApiUrl('');
    markDone();
  };

  const onSendTestError = () => {
    // A bug-style error, so providers file it as a non-fatal. Dropped in debug builds and when reporting is off.
    recordError(new Error('Test error from the debug menu'), { source: 'debug-menu' });
    markDone();
  };

  const onClearStorage = () => {
    storage.clearAll();
    markDone();
  };

  const onClearQueryCache = () => {
    queryClient.clear();
    markDone();
  };

  const onClearTokens = () => {
    void useAuthStore.getState().signOut();
    markDone();
  };

  return {
    apiUrl,
    doneMessage,
    onApiUrlChange: setApiUrl,
    onApiUrlSave,
    onApiUrlClear,
    onResetFlags: clearFlagOverrides,
    onSendTestError,
    onClearStorage,
    onClearQueryCache,
    onClearTokens,
    onOpenNetworkLog: () => {
      navigation.navigate('NetworkLog');
    },
    // @tempo-feature:dynamic-forms:start
    onOpenCodeForm: () => {
      navigation.navigate('DynamicFormFlow', { flowId: 'demo-code' });
    },
    onOpenJsonForm: () => {
      navigation.navigate('DynamicFormFlow', { flowId: 'demo-json' });
    },
    // @tempo-feature:dynamic-forms:end
  };
}
