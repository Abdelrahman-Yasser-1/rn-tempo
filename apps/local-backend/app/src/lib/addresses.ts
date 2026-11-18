import type { BackendStatus } from '../api/types';

export interface AddressRow {
  label: string;
  url: string | null;
  note?: string;
}

/** The addresses a client can use, in the order the Dashboard lists them. */
export function addressRows(status: Pick<BackendStatus, 'scheme' | 'port'>, lan: string | null): AddressRow[] {
  if (status.scheme === null || status.port === null) return [];
  const base = (host: string): string => `${status.scheme ?? 'http'}://${host}:${String(status.port)}`;
  return [
    { label: 'This Mac', url: base('localhost') },
    lan === null ? { label: 'Phone on Wi-Fi', url: null, note: 'This Mac is not on a network.' } : { label: 'Phone on Wi-Fi', url: base(lan) },
    { label: 'Android emulator', url: base('10.0.2.2') },
    { label: 'iOS simulator', url: base('localhost') },
  ];
}
