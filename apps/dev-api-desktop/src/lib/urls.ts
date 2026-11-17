import type { ServerInfo } from '../client/types';

export interface UrlRow {
  label: string;
  url: string;
}

/** The addresses a client can use, in the order the Overview lists them. */
export function urlRows(info: ServerInfo): UrlRow[] {
  const rows: UrlRow[] = [{ label: 'This Mac', url: info.urls.local }];
  if (info.urls.lan !== undefined) rows.push({ label: 'LAN (phone on the same Wi-Fi)', url: info.urls.lan });
  rows.push({ label: 'Android emulator', url: info.urls.androidEmulator });
  rows.push({ label: 'iOS simulator', url: info.urls.iosSimulator });
  return rows;
}

/** Compares `1.2.3` style versions. Negative when `a` is older than `b`. Unreadable parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const parts = (value: string): number[] => value.split('-')[0]?.split('.').map((part) => Number.parseInt(part, 10) || 0) ?? [];
  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** The oldest project dev API the app drives well (the control routes this app uses landed with it). */
export const MIN_DEV_API_VERSION = '0.0.0';

export function isOlderThanSupported(version: string | null): boolean {
  return version !== null && compareVersions(version, MIN_DEV_API_VERSION) < 0;
}
