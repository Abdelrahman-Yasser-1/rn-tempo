import type { FaultsDef } from '../api/types';

import type { Made } from './network';

export type FaultKey = 'ip' | 'user' | 'global';
export type OfflineMode = 'inherit' | 'on' | 'off';

/** The faults of one endpoint. A blank text means "same as the backend": the key is left out. */
export interface FaultsForm {
  /** `inherit`: the backend's limit. `off`: no limit here (`null`). `own`: the numbers below. */
  limit: 'inherit' | 'off' | 'own';
  requests: string;
  perSeconds: string;
  key: FaultKey;
  /** Percent, 0 to 100. */
  failureRate: string;
  failureStatus: string;
  dropRate: string;
  offline: OfflineMode;
  slowUpload: string;
  slowDownload: string;
  /** Not shown in the form: whatever the JSON holds stays as it is. */
  failureBody: unknown;
}

export const blankFaults = (): FaultsForm => ({
  limit: 'inherit',
  requests: '60',
  perSeconds: '60',
  key: 'ip',
  failureRate: '',
  failureStatus: '',
  dropRate: '',
  offline: 'inherit',
  slowUpload: '',
  slowDownload: '',
  failureBody: undefined,
});

const percentText = (rate: number | undefined): string => (rate === undefined ? '' : String(Number((rate * 100).toPrecision(12))));
const numberText = (value: number | undefined): string => (value === undefined ? '' : String(value));

export function faultsFormFrom(faults: FaultsDef | undefined): FaultsForm {
  const blank = blankFaults();
  if (faults === undefined) return blank;
  const limit = faults.rateLimit;
  return {
    limit: limit === undefined ? 'inherit' : limit === null ? 'off' : 'own',
    requests: limit ? String(limit.requests) : blank.requests,
    perSeconds: limit ? String(limit.perSeconds) : blank.perSeconds,
    key: limit?.key ?? blank.key,
    failureRate: percentText(faults.failureRate),
    failureStatus: numberText(faults.failureStatus),
    dropRate: percentText(faults.dropRate),
    offline: faults.offline === undefined ? 'inherit' : faults.offline ? 'on' : 'off',
    slowUpload: numberText(faults.slowUpload),
    slowDownload: numberText(faults.slowDownload),
    failureBody: faults.failureBody,
  };
}

const whole = (text: string, min: number, max: number): number | null => (/^\d{1,9}$/.test(text.trim()) && Number(text) >= min && Number(text) <= max ? Number(text) : null);
const percent = (text: string): number | null => {
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(text.trim())) return null;
  const value = Number(text);
  return value <= 100 ? value / 100 : null;
};

/** The faults a form describes. `value` is `undefined` when nothing is set (the endpoint then has no `faults` at all). */
export function faultsFrom(form: FaultsForm): Made<FaultsDef | undefined> {
  const out: FaultsDef = {};
  if (form.limit === 'off') out.rateLimit = null;
  if (form.limit === 'own') {
    const requests = whole(form.requests, 1, 1_000_000);
    const perSeconds = whole(form.perSeconds, 1, 86_400);
    if (requests === null || perSeconds === null) return { ok: false, message: 'The rate limit needs whole numbers: requests from 1 to 1000000, seconds from 1 to 86400.' };
    out.rateLimit = { requests, perSeconds, key: form.key };
  }
  if (form.failureRate.trim() !== '') {
    const rate = percent(form.failureRate);
    if (rate === null) return { ok: false, message: 'The failure rate is a percentage from 0 to 100.' };
    out.failureRate = rate;
  }
  if (form.failureStatus.trim() !== '') {
    const status = whole(form.failureStatus, 400, 599);
    if (status === null) return { ok: false, message: 'The failure status is a number from 400 to 599.' };
    out.failureStatus = status;
  }
  if (form.failureBody !== undefined) out.failureBody = form.failureBody;
  if (form.dropRate.trim() !== '') {
    const rate = percent(form.dropRate);
    if (rate === null) return { ok: false, message: 'The share of dropped connections is a percentage from 0 to 100.' };
    out.dropRate = rate;
  }
  if (form.offline !== 'inherit') out.offline = form.offline === 'on';
  for (const [key, text, label] of [
    ['slowUpload', form.slowUpload, 'The upload speed'],
    ['slowDownload', form.slowDownload, 'The download speed'],
  ] as const) {
    if (text.trim() === '') continue;
    const value = whole(text, 1, 10_000_000);
    if (value === null) return { ok: false, message: `${label} is a number of kilobits per second from 1 to 10000000.` };
    out[key] = value;
  }
  return { ok: true, value: Object.keys(out).length === 0 ? undefined : out };
}

/** One line for the endpoint page, or `null` when the endpoint sets no faults. */
export function faultsSummary(faults: FaultsDef | undefined): string | null {
  if (faults === undefined) return null;
  const parts: string[] = [];
  if (faults.offline !== undefined) parts.push(faults.offline ? 'offline' : 'online');
  if (faults.failureRate !== undefined || faults.failureStatus !== undefined) {
    parts.push(`${percentText(faults.failureRate ?? 0)}% fail (${String(faults.failureStatus ?? 500)})`);
  }
  if (faults.dropRate !== undefined) parts.push(`${percentText(faults.dropRate)}% dropped`);
  if (faults.rateLimit === null) parts.push('no limit');
  else if (faults.rateLimit !== undefined) parts.push(`limit ${String(faults.rateLimit.requests)}/${String(faults.rateLimit.perSeconds)}s per ${faults.rateLimit.key ?? 'ip'}`);
  if (faults.slowUpload !== undefined) parts.push(`${String(faults.slowUpload)} kbps up`);
  if (faults.slowDownload !== undefined) parts.push(`${String(faults.slowDownload)} kbps down`);
  return parts.length === 0 ? null : `Faults: ${parts.join(', ')}`;
}
