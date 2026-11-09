import Config from 'react-native-config';

import { parseEnv, type Env } from './parseEnv';

// Single source of truth for env vars. Import `ENV`, never `react-native-config` (lint-enforced).
export type { Env };

// Fail fast: `parseEnv` throws an `EnvError` at import time, so a misconfigured build never reaches users.
export const ENV: Env = parseEnv(Config);
export const isDev = ENV.APP_ENV === 'dev';
export const isStaging = ENV.APP_ENV === 'staging';
export const isProd = ENV.APP_ENV === 'prod';
/** True under Jest, which sets `NODE_ENV=test`; Metro inlines it in app builds. */
export const isTest = process.env.NODE_ENV === 'test';
