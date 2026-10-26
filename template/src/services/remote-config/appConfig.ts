import { z } from 'zod';

import { FLAG_DEFAULTS, type FlagKey } from '@services/flags/flags';

const FLAG_KEYS = Object.keys(FLAG_DEFAULTS) as [FlagKey, ...FlagKey[]];
const PlatformValues = z.object({ ios: z.string(), android: z.string() });

/** Remote app configuration (contract C13 `GET /app-config`). */
export const AppConfigSchema = z.object({
  minSupportedVersion: PlatformValues,
  latestVersion: PlatformValues,
  maintenance: z.object({ enabled: z.boolean(), message: z.string().optional() }),
  // Partial: the server only needs to send the flags it wants to override.
  flags: z.partialRecord(z.enum(FLAG_KEYS), z.boolean()),
  storeUrls: PlatformValues,
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

/** Used whenever the config cannot be fetched: nothing blocks, flags fall back to code defaults. */
export const DEFAULT_APP_CONFIG: AppConfig = {
  minSupportedVersion: { ios: '0.0.0', android: '0.0.0' },
  latestVersion: { ios: '0.0.0', android: '0.0.0' },
  maintenance: { enabled: false },
  flags: {},
  storeUrls: { ios: '', android: '' },
};
