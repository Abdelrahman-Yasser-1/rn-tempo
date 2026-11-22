import type { IncomingHttpHeaders } from 'node:http';

import { TEST_FAULTS_HEADER } from './constants.ts';
import type { Rng } from './import/generate.ts';
import type { Faults } from './schema.ts';

export interface FaultPlan {
  /** Faults apply to this request (not test mode, or the request opted in). */
  active: boolean;
  offline: boolean;
  fail: boolean;
  drop: boolean;
  failureStatus: number;
  failureBody: unknown;
  rateLimit: { requests: number; perSeconds: number; key: 'ip' | 'user' | 'global'; scope: string } | undefined;
  slowUpload?: number;
  slowDownload?: number;
}

export const NO_FAULTS: FaultPlan = { active: false, offline: false, fail: false, drop: false, failureStatus: 500, failureBody: undefined, rateLimit: undefined };

const flag = (value: string | string[] | undefined): boolean => (Array.isArray(value) ? value[0] : value)?.trim() === '1';

/** Faults are off in test mode, unless the request sends `x-tempo-test-faults: 1`. */
export const faultsActive = (testMode: boolean, headers: IncomingHttpHeaders): boolean => !testMode || flag(headers[TEST_FAULTS_HEADER]);

/** The endpoint's settings over the backend's: each setting the endpoint gives replaces the default. */
export function mergeFaults(base: Faults | undefined, own: Faults | undefined): Faults {
  return { ...base, ...Object.fromEntries(Object.entries(own ?? {}).filter(([, value]) => value !== undefined)) };
}

/**
 * What goes wrong for one request. The random draws come from `rng`, which is seeded by the request number: the same
 * number always gives the same answer, so a run can be repeated.
 */
export function planFaults(input: { backend: Faults | undefined; endpoint: Faults | undefined; endpointId: string | undefined; active: boolean; rng: Rng }): FaultPlan {
  if (!input.active) return NO_FAULTS;
  const faults = mergeFaults(input.backend, input.endpoint);
  const failDraw = input.rng.next();
  const dropDraw = input.rng.next();
  const own = input.endpoint?.rateLimit;
  const limit = faults.rateLimit;
  return {
    active: true,
    offline: faults.offline === true,
    fail: faults.failureRate !== undefined && failDraw < faults.failureRate,
    drop: faults.dropRate !== undefined && dropDraw < faults.dropRate,
    failureStatus: faults.failureStatus ?? 500,
    failureBody: faults.failureBody,
    ...(faults.slowUpload === undefined ? {} : { slowUpload: faults.slowUpload }),
    ...(faults.slowDownload === undefined ? {} : { slowDownload: faults.slowDownload }),
    rateLimit: limit === null || limit === undefined ? undefined : { ...limit, scope: own === undefined || own === null ? '*' : (input.endpointId ?? '*') },
  };
}

export interface RateDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Whole seconds until the window ends. */
  resetSec: number;
}

/** Fixed windows: the first request of a key opens one, and it closes `perSeconds` later. */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  hit(bucket: string, limit: { requests: number; perSeconds: number }, nowMs: number): RateDecision {
    const span = limit.perSeconds * 1000;
    let window = this.windows.get(bucket);
    if (window === undefined || nowMs - window.start >= span) {
      window = { start: nowMs, count: 0 };
      this.windows.set(bucket, window);
      if (this.windows.size > 10_000) for (const [key, value] of this.windows) if (nowMs - value.start >= span) this.windows.delete(key);
    }
    window.count += 1;
    const allowed = window.count <= limit.requests;
    return { allowed, limit: limit.requests, remaining: Math.max(0, limit.requests - window.count), resetSec: Math.max(1, Math.ceil((window.start + span - nowMs) / 1000)) };
  }

  reset(): void {
    this.windows.clear();
  }
}

/** The IETF `RateLimit` headers (the draft's structured form and the older `RateLimit-Limit/Remaining/Reset` trio), plus `Retry-After` when blocked. */
export function rateHeaders(decision: RateDecision, perSeconds: number): Record<string, string> {
  return {
    'ratelimit-limit': String(decision.limit),
    'ratelimit-remaining': String(decision.remaining),
    'ratelimit-reset': String(decision.resetSec),
    ratelimit: `limit=${String(decision.limit)}, remaining=${String(decision.remaining)}, reset=${String(decision.resetSec)}`,
    'ratelimit-policy': `${String(decision.limit)};w=${String(perSeconds)}`,
    ...(decision.allowed ? {} : { 'retry-after': String(decision.resetSec) }),
  };
}

export interface FaultCounts {
  rateLimited: number;
  failed: number;
  dropped: number;
  offline: number;
}
