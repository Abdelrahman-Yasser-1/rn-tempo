import type { AppConfig } from '@services/remote-config/appConfig';
import { useAppConfig } from '@services/remote-config/remoteConfig';

import { getFlagOverride, useFlagOverrideRevision } from './flagOverrides';
import { FLAG_DEFAULTS, type FlagKey } from './flags';

/** Resolution order (contract C15): debug override (non-prod) → remote config → code default. */
export function resolveFlag(flag: FlagKey, config: Pick<AppConfig, 'flags'> | undefined): boolean {
  return getFlagOverride(flag) ?? config?.flags[flag] ?? FLAG_DEFAULTS[flag];
}

/** Reactive feature flag; re-renders on config refresh and on debug-menu overrides. */
export function useFeatureFlag(flag: FlagKey): boolean {
  useFlagOverrideRevision();
  const { data } = useAppConfig();
  return resolveFlag(flag, data);
}
