import Config from 'react-native-config';
import { z } from 'zod';

// Single source of truth for env vars. Import `ENV`, never `react-native-config` (lint-enforced).
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const EnvSchema = z
  .object({
    APP_ENV: z.enum(['dev', 'staging', 'prod']),
    API_BASE_URL: z.url(),
    API_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
    API_MOCKING: bool.default(false),
    SSL_PINNING_ENABLED: bool.default(false),
    SSL_PINS: z
      .string()
      .default('')
      .transform((s) =>
        s
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean),
      ),
    DEVICE_INTEGRITY_ENABLED: bool.default(false),
    STORYBOOK_ENABLED: bool.default(false),
    DEEP_LINK_SCHEME: z.string().min(1),
    DEEP_LINK_HOST: z.string().default(''),
    APP_CONFIG_PATH: z.string().default('/app-config'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.SSL_PINNING_ENABLED && env.SSL_PINS.length < 2) {
      ctx.addIssue({
        code: 'custom',
        path: ['SSL_PINS'],
        message: 'At least 2 pins required when SSL_PINNING_ENABLED=true',
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(Config);
if (!parsed.success) {
  // Fail fast: a misconfigured build must never reach users.
  throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
}

export const ENV: Env = parsed.data;
export const isDev = ENV.APP_ENV === 'dev';
export const isStaging = ENV.APP_ENV === 'staging';
export const isProd = ENV.APP_ENV === 'prod';
