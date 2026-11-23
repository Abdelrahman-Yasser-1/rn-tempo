import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { Transform, type TransformCallback } from 'node:stream';

import type { NetworkNote } from './shared/request-log.ts';

import { DEFAULT_TIMEOUT_MS, MAX_DELAY_MS, MAX_TIMEOUT_MS, TEST_DELAYS_HEADER, TEST_MODE_HEADER } from './constants.ts';
import type { FaultPlan } from './faults.ts';
import { Rng } from './import/generate.ts';
import type { Backend, Endpoint, Latency, Network, NetworkPreset, Scenario } from './schema.ts';

/**
 * What each network preset does. The numbers follow Chrome DevTools' throttling profiles (`SDK.NetworkManager`):
 * Fast 4G is 9 Mbps down, 1.5 Mbps up and 60 ms RTT; Slow 3G is 500 kbps both ways and 400 ms RTT. They use DevTools'
 * nominal values, not its calibration multipliers, because a server that really waits needs the real figures.
 * `wifi` is not a DevTools profile: it is a typical fast home connection.
 */
export interface PresetProfile {
  /** Added to every request when no explicit latency is set. */
  latencyMs: number;
  /** Kilobits per second the response is sent at; absent means no limit. */
  downloadKbps?: number;
  uploadKbps?: number;
}

export const PRESET_PROFILES: Readonly<Record<NetworkPreset, PresetProfile>> = {
  instant: { latencyMs: 0 },
  wifi: { latencyMs: 20, downloadKbps: 30_000, uploadKbps: 15_000 },
  '4g': { latencyMs: 60, downloadKbps: 9000, uploadKbps: 1500 },
  '3g-slow': { latencyMs: 400, downloadKbps: 500, uploadKbps: 500 },
  timeout: { latencyMs: 0 },
  custom: { latencyMs: 0 },
};

export type DelaySource = 'scenario' | 'endpoint' | 'default' | 'preset' | 'timeout' | 'none';

/** What to do to one request: wait, throttle, or hold it until it times out. */
export interface NetworkPlan {
  /** Milliseconds to wait before the endpoint runs. */
  delayMs: number;
  delaySource: DelaySource;
  /** Kilobits per second for the response body; absent means unthrottled. */
  downloadKbps?: number;
  /** Kilobits per second for the request body. */
  uploadKbps?: number;
  /** Hold the request this long, then close the connection without an answer. */
  timeoutMs?: number;
  /** Test mode zeroed the settings. */
  zeroed: boolean;
}

/** A plan with the number of the request and whether it runs in test mode (fixed clock, seeded values). */
export interface RequestPlan {
  requestId: number;
  testMode: boolean;
  network: NetworkPlan;
  /** Simulated trouble for this request (rate limit, failure, drop, offline). */
  faults: FaultPlan;
}

const off = (value: string | string[] | undefined): boolean => (Array.isArray(value) ? value[0] : value)?.trim() === '0';
const flag = (value: string | string[] | undefined): boolean => (Array.isArray(value) ? value[0] : value)?.trim() === '1';

/**
 * Whether a request runs in test mode: the engine option or the definition turns it on for every request, and the
 * `x-tempo-test-mode: 1` header for one (`0` turns it off for one). In test mode every delay, throttle and timeout is 0 unless the request also sends
 * `x-tempo-test-delays: 1`.
 */
export function testModeOf(options: { engine: boolean; definition: boolean; headers: IncomingHttpHeaders }): { testMode: boolean; zeroed: boolean } {
  // `x-tempo-test-mode: 0` opts one request out, even when the engine (a test session) or the definition turns test mode on.
  const testMode = !off(options.headers[TEST_MODE_HEADER]) && (options.engine || options.definition || flag(options.headers[TEST_MODE_HEADER]));
  return { testMode, zeroed: testMode && !flag(options.headers[TEST_DELAYS_HEADER]) };
}

const pick = <T>(setting: T | 'inherit' | undefined): T | undefined => (setting === 'inherit' || setting === undefined ? undefined : setting);

function latencyMs(latency: Latency, rng: Rng): number {
  const value = 'fixedMs' in latency ? latency.fixedMs : rng.int(latency.minMs, latency.maxMs);
  return Math.min(MAX_DELAY_MS, Math.max(0, value));
}

export interface PlanInput {
  definition: Pick<Backend, 'latency' | 'network'>;
  endpoint?: Pick<Endpoint, 'latency' | 'network'> | undefined;
  scenario?: Pick<Scenario, 'delayMs'> | undefined;
  /** Test mode without the opt-in: everything is 0. */
  zeroed: boolean;
  /** Seeded per request, so a random delay can be reproduced. */
  rng: Rng;
}

/**
 * The delay and throttling of one request. The first of these that applies sets the delay: the scenario's `delayMs`, the
 * endpoint's `latency`, the backend's `latency.default`, then the preset's own latency. The endpoint's `network` replaces
 * the backend's. The `timeout` preset (or a `timeoutMs` on `custom`) holds the request instead of waiting.
 */
export function planNetwork(input: PlanInput): NetworkPlan {
  if (input.zeroed) return { delayMs: 0, delaySource: 'none', zeroed: true };
  const network: Network | undefined = pick(input.endpoint?.network) ?? input.definition.network;
  const profile = PRESET_PROFILES[network?.preset ?? 'instant'];
  const downloadKbps = network?.downloadKbps ?? profile.downloadKbps;
  const uploadKbps = network?.uploadKbps ?? profile.uploadKbps;
  const holds = network?.preset === 'timeout' || (network?.preset === 'custom' && network.timeoutMs !== undefined);
  const timeoutMs = holds ? Math.min(MAX_TIMEOUT_MS, network?.timeoutMs ?? DEFAULT_TIMEOUT_MS) : undefined;
  const common = {
    zeroed: false,
    ...(downloadKbps === undefined ? {} : { downloadKbps }),
    ...(uploadKbps === undefined ? {} : { uploadKbps }),
  };
  if (timeoutMs !== undefined) return { ...common, delayMs: timeoutMs, delaySource: 'timeout', timeoutMs };
  const endpointLatency = pick(input.endpoint?.latency);
  const wait = ((): { ms: number; source: DelaySource } => {
    if (input.scenario?.delayMs !== undefined) return { ms: input.scenario.delayMs, source: 'scenario' };
    if (endpointLatency !== undefined) return { ms: latencyMs(endpointLatency, input.rng), source: 'endpoint' };
    const fallback = input.definition.latency?.default;
    if (fallback !== undefined) return { ms: latencyMs(fallback, input.rng), source: 'default' };
    return profile.latencyMs > 0 ? { ms: profile.latencyMs, source: 'preset' } : { ms: 0, source: 'none' };
  })();
  return { ...common, delayMs: wait.ms, delaySource: wait.ms === 0 ? 'none' : wait.source };
}

/** The part of a plan the request log keeps. Empty (`undefined`) when nothing was simulated. */
export function noteOf(plan: NetworkPlan, outcome: 'closed' | 'done'): NetworkNote | undefined {
  const note: NetworkNote = {
    ...(plan.delayMs > 0 ? { delayMs: plan.delayMs, delaySource: plan.delaySource } : {}),
    ...(plan.downloadKbps === undefined ? {} : { downloadKbps: plan.downloadKbps }),
    ...(plan.uploadKbps === undefined ? {} : { uploadKbps: plan.uploadKbps }),
    ...(outcome === 'closed' ? { timedOut: true as const } : {}),
    ...(plan.zeroed ? { testMode: true as const } : {}),
  };
  return Object.keys(note).length === 0 ? undefined : note;
}

// ---- waiting

/** Waits `ms` (at most `MAX_TIMEOUT_MS`), or less when `signal` aborts: the timer is cleared then. */
export function sleepFor(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((done) => {
    if (signal?.aborted === true) return done();
    const timer = setTimeout(finish, Math.min(Math.max(0, ms), MAX_TIMEOUT_MS));
    function finish(): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      done();
    }
    signal?.addEventListener('abort', finish, { once: true });
  });
}

// ---- throttling

/** The seed text of a request's random numbers. */
export const requestSeed = (engineSeed: string, requestId: number): string => `${engineSeed}:${String(requestId)}`;

const SLICES_PER_SECOND = 20;
const MIN_SLICE = 256;
const MAX_SLICE = 64 * 1024;

/** Bytes per second for a rate in kilobits per second. */
export const bytesPerSecond = (kbps: number): number => (kbps * 1000) / 8;

/**
 * Passes bytes through at a fixed rate. A chunk is cut into slices of about 50 ms of data and each slice is let through
 * when its time has come, measured from the first byte, so the average rate holds even when timers run late. Destroying
 * the stream (the client went away) clears the pending timer.
 */
export class ThrottleStream extends Transform {
  private readonly rate: number;
  private readonly clock: () => number;
  private timer: NodeJS.Timeout | undefined;
  private startedAt: number | undefined;
  private sent = 0;

  constructor(kbps: number, clock: () => number = () => performance.now()) {
    super();
    this.rate = Math.max(1, bytesPerSecond(kbps));
    this.clock = clock;
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
    const slice = Math.min(MAX_SLICE, Math.max(MIN_SLICE, Math.floor(this.rate / SLICES_PER_SECOND)));
    let offset = 0;
    const next = (): void => {
      this.timer = undefined;
      if (this.destroyed) return;
      if (offset >= chunk.length) return done();
      const part = chunk.subarray(offset, offset + slice);
      offset += part.length;
      this.startedAt ??= this.clock();
      this.push(part);
      this.sent += part.length;
      const wait = this.startedAt + (this.sent * 1000) / this.rate - this.clock();
      if (wait > 1) this.timer = setTimeout(next, wait);
      else next();
    };
    next();
  }

  override _destroy(error: Error | null, done: (error?: Error | null) => void): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    done(error);
  }
}

/**
 * Slows reading a request body to about `kbps` by pausing the stream between chunks. Every timer is cleared when the request
 * ends or the client goes away. Returns a function that stops the pacing early.
 */
export function paceRequest(req: IncomingMessage, kbps: number, clock: () => number = () => performance.now()): () => void {
  const rate = Math.max(1, bytesPerSecond(kbps));
  let startedAt: number | undefined;
  let received = 0;
  let timer: NodeJS.Timeout | undefined;
  const stop = (): void => {
    clearTimeout(timer);
    timer = undefined;
    req.off('data', onData);
    req.off('close', stop);
    req.off('end', stop);
    req.off('error', stop);
  };
  function onData(chunk: Buffer): void {
    startedAt ??= clock();
    received += chunk.length;
    const wait = startedAt + (received * 1000) / rate - clock();
    if (wait <= 1 || timer !== undefined) return;
    req.pause();
    timer = setTimeout(() => {
      timer = undefined;
      req.resume();
    }, wait);
  }
  req.on('data', onData);
  req.once('close', stop);
  req.once('end', stop);
  req.once('error', stop);
  return stop;
}
