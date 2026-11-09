import { z } from 'zod';

import { CRASH_REPORTER_NAMES } from './crashReporters';

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
    FIREBASE_ENABLED: bool.default(false),
    PUSH_ENABLED: bool.default(false),
    CRASH_REPORTING_ENABLED: bool.default(false),
    CRASH_REPORTER: z.enum(CRASH_REPORTER_NAMES).default('none'),
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

/** Thrown by `parseEnv` for a misconfigured build; `issues` are the Zod issues behind the message. */
export class EnvError extends Error {
  readonly issues: readonly z.core.$ZodIssue[];

  /** Builds the message from the Zod error with `z.prettifyError`. */
  constructor(error: z.ZodError) {
    super(`Invalid environment configuration:\n${z.prettifyError(error)}`);
    this.name = 'EnvError';
    this.issues = error.issues;
  }
}

/** Validates raw config values (strings from `react-native-config`) into a typed `Env`; throws `EnvError`. */
export function parseEnv(raw: Record<string, unknown>): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    throw new EnvError(parsed.error);
  }
  return parsed.data;
}
