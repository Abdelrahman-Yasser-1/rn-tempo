import type { EndpointDefinition, ResourceBinding } from './types.ts';

export interface ApiConfigInput {
  /** Endpoints and `resource(...)` results, in any mix. */
  endpoints: readonly (EndpointDefinition | readonly EndpointDefinition[])[];
  /** Mounted in front of every path. Empty by default; the real backend uses `/api/v1`. */
  basePath?: string;
  /** Defaults to 8443. */
  port?: number;
  /** Seed of the data generator. Defaults to 1. */
  seed?: number;
  /** Turns on the mock login (`/auth/login`, `/auth/refresh`, `/auth/me`). Development only. */
  auth?: boolean;
}

/** The normalized config the servers read. */
export interface ApiConfig {
  readonly endpoints: readonly EndpointDefinition[];
  readonly basePath: string;
  readonly port: number;
  readonly seed: number;
  readonly auth: boolean;
  /** One entry per resource name, taken from the endpoints. */
  readonly resources: readonly ResourceBinding[];
}

/** Normalizes a base path: `''`, or `/x/y` without a trailing slash. */
export function normalizeBasePath(basePath: string): string {
  const trimmed = basePath.trim().replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '' : `/${trimmed}`;
}

/** The URL path an endpoint is served on, with the base path in front. */
export function mountedPath(basePath: string, path: string): string {
  return `${normalizeBasePath(basePath)}${path}`;
}

/** Flattens endpoints, checks ids and routes are unique, and fills in the defaults. */
export function defineConfig(input: ApiConfigInput): ApiConfig {
  const endpoints = input.endpoints.flatMap((entry) =>
    Array.isArray(entry) ? [...(entry as readonly EndpointDefinition[])] : [entry as EndpointDefinition],
  );

  const ids = new Set<string>();
  const routes = new Set<string>();
  for (const endpoint of endpoints) {
    if (ids.has(endpoint.id)) throw new Error(`Duplicate endpoint id "${endpoint.id}"`);
    ids.add(endpoint.id);
    const route = `${endpoint.method} ${endpoint.path}`;
    if (routes.has(route)) throw new Error(`Duplicate route ${route}`);
    routes.add(route);
  }

  const resources = new Map<string, ResourceBinding>();
  for (const endpoint of endpoints) {
    if (endpoint.resource !== undefined && !resources.has(endpoint.resource.name)) {
      resources.set(endpoint.resource.name, endpoint.resource);
    }
  }

  return {
    endpoints,
    basePath: normalizeBasePath(input.basePath ?? ''),
    port: input.port ?? 8443,
    seed: input.seed ?? 1,
    auth: input.auth ?? false,
    resources: [...resources.values()],
  };
}
