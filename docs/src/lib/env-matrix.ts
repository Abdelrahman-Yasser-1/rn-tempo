import { readFileSync } from 'node:fs';
import path from 'node:path';

type TempoEnv = {
  name: string;
  suffix: string;
  displayName: string;
  scheme: string;
  badge: string | null;
};

type TempoJson = {
  app: { name: string; bundleId: string };
  envs: TempoEnv[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Reads and checks `.tempo.json`; a malformed file fails the docs build. */
export function readTempoJson(repoRoot: string): TempoJson {
  const file = path.join(repoRoot, 'template', '.tempo.json');
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!isRecord(parsed) || !isRecord(parsed.app) || !Array.isArray(parsed.envs)) {
    throw new Error(`EnvMatrix: ${file} has no "app" and "envs"`);
  }
  return parsed as TempoJson;
}

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export type MatrixRow = { key: string; values: string[] };

/**
 * Builds the environment matrix (PLAN B2) from `.tempo.json`. Everything not stored in the file
 * follows the naming rules of the template: flavors, schemes and configs derive from the env name.
 */
export function buildMatrix(tempo: TempoJson): { envs: string[]; rows: MatrixRow[] } {
  const { app, envs } = tempo;
  const isProd = (env: TempoEnv) => env.suffix === '';
  const rows: MatrixRow[] = [
    { key: '`APP_ENV` value', values: envs.map((env) => env.name) },
    { key: 'Android flavor', values: envs.map((env) => env.name) },
    {
      key: 'Android variants',
      values: envs.map((env) => `${env.name}Debug, ${env.name}Release`),
    },
    {
      key: '`applicationIdSuffix`',
      values: envs.map((env) => (isProd(env) ? '(none)' : env.suffix)),
    },
    { key: 'Bundle ID', values: envs.map((env) => `${app.bundleId}${env.suffix}`) },
    { key: 'Display name', values: envs.map((env) => env.displayName) },
    {
      key: 'iOS build configs',
      values: envs.map((env) => `Debug-${capitalize(env.name)}, Release-${capitalize(env.name)}`),
    },
    { key: 'iOS scheme', values: envs.map((env) => `${app.name}-${capitalize(env.name)}`) },
    {
      key: 'iOS xcconfig',
      values: envs.map((env) => `ios/Config/${capitalize(env.name)}.*.xcconfig`),
    },
    {
      key: 'iOS AppIcon set',
      values: envs.map((env) => (isProd(env) ? 'AppIcon' : `AppIcon-${capitalize(env.name)}`)),
    },
    { key: 'Env file', values: envs.map((env) => `.env.${env.name}`) },
    { key: 'URL scheme', values: envs.map((env) => env.scheme) },
    { key: 'Icon badge', values: envs.map((env) => env.badge ?? '(none)') },
    {
      key: 'Run scripts',
      values: envs.map((env) => `android:${env.name}, ios:${env.name}, start:${env.name}`),
    },
  ];
  return { envs: envs.map((env) => env.name), rows };
}
