import type { LatencyDef, NetworkDef, NetworkPresetName } from '../api/types';

/** The network presets, with what each one does (Chrome DevTools throttling profiles; Wi-Fi is a typical fast connection). */
export const PRESETS: { value: NetworkPresetName; label: string; detail: string }[] = [
  { value: 'instant', label: 'Instant', detail: 'No delay and no speed limit.' },
  { value: 'wifi', label: 'Fast Wi-Fi', detail: '20 ms delay, 30 Mbps down, 15 Mbps up.' },
  { value: '4g', label: '4G', detail: '60 ms delay, 9 Mbps down, 1.5 Mbps up (Chrome "Fast 4G").' },
  { value: '3g-slow', label: 'Slow 3G', detail: '400 ms delay, 500 kbps down and up (Chrome "Slow 3G").' },
  { value: 'timeout', label: 'Timeout', detail: 'Holds the request, then closes the connection without an answer.' },
  { value: 'custom', label: 'Custom', detail: 'Only the speeds you type below.' },
];

export const MAX_DELAY_MS = 60_000;
export const MAX_TIMEOUT_MS = 120_000;

export interface LatencyForm {
  mode: 'inherit' | 'none' | 'fixed' | 'range';
  fixed: string;
  min: string;
  max: string;
}

export const blankLatency = (mode: LatencyForm['mode']): LatencyForm => ({ mode, fixed: '300', min: '100', max: '900' });

/** The form of a latency setting. A missing or `"inherit"` one is `inherit` (an endpoint) or `none` (the backend default). */
export function latencyFormFrom(latency: LatencyDef | 'inherit' | undefined, missing: 'inherit' | 'none'): LatencyForm {
  if (latency === undefined || latency === 'inherit') return blankLatency(missing);
  return 'fixedMs' in latency ? { ...blankLatency('fixed'), fixed: String(latency.fixedMs) } : { ...blankLatency('range'), min: String(latency.minMs), max: String(latency.maxMs) };
}

const wholeMs = (text: string, max: number): number | null => (/^\d{1,7}$/.test(text.trim()) && Number(text) <= max ? Number(text) : null);

export type Made<T> = { ok: true; value: T } | { ok: false; message: string };

/** The latency a form describes. `value` is `undefined` for "inherit" / "none" (the key is left out). */
export function latencyFrom(form: LatencyForm): Made<LatencyDef | undefined> {
  if (form.mode === 'inherit' || form.mode === 'none') return { ok: true, value: undefined };
  if (form.mode === 'fixed') {
    const fixedMs = wholeMs(form.fixed, MAX_DELAY_MS);
    return fixedMs === null ? { ok: false, message: `The delay is a number of milliseconds from 0 to ${String(MAX_DELAY_MS)}.` } : { ok: true, value: { fixedMs } };
  }
  const minMs = wholeMs(form.min, MAX_DELAY_MS);
  const maxMs = wholeMs(form.max, MAX_DELAY_MS);
  if (minMs === null || maxMs === null) return { ok: false, message: `The shortest and longest delay are numbers of milliseconds from 0 to ${String(MAX_DELAY_MS)}.` };
  if (minMs > maxMs) return { ok: false, message: 'The shortest delay cannot be longer than the longest.' };
  return { ok: true, value: { minMs, maxMs } };
}

export interface NetworkForm {
  /** `inherit` is for an endpoint: use the backend's. */
  preset: NetworkPresetName | 'inherit';
  down: string;
  up: string;
  timeout: string;
}

export const blankNetwork = (preset: NetworkForm['preset']): NetworkForm => ({ preset, down: '', up: '', timeout: '' });

export function networkFormFrom(network: NetworkDef | 'inherit' | undefined, missing: 'inherit' | 'instant'): NetworkForm {
  if (network === undefined || network === 'inherit') return blankNetwork(missing);
  return {
    preset: network.preset,
    down: network.downloadKbps === undefined ? '' : String(network.downloadKbps),
    up: network.uploadKbps === undefined ? '' : String(network.uploadKbps),
    timeout: network.timeoutMs === undefined ? '' : String(network.timeoutMs),
  };
}

const kbps = (text: string): number | null => (/^\d{1,8}$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= 10_000_000 ? Number(text) : null);

/** The network a form describes: `undefined` for "inherit" (and for the backend's "instant" with nothing else). */
export function networkFrom(form: NetworkForm): Made<NetworkDef | undefined> {
  if (form.preset === 'inherit') return { ok: true, value: undefined };
  const out: NetworkDef = { preset: form.preset };
  for (const [key, text, label] of [
    ['downloadKbps', form.down, 'The download speed'],
    ['uploadKbps', form.up, 'The upload speed'],
  ] as const) {
    if (text.trim() === '') continue;
    const value = kbps(text);
    if (value === null) return { ok: false, message: `${label} is a number of kilobits per second (1 or more).` };
    out[key] = value;
  }
  if (form.timeout.trim() !== '') {
    const value = wholeMs(form.timeout, MAX_TIMEOUT_MS);
    if (value === null || value < 1) return { ok: false, message: `The timeout is a number of milliseconds from 1 to ${String(MAX_TIMEOUT_MS)}.` };
    out.timeoutMs = value;
  }
  return { ok: true, value: out };
}
