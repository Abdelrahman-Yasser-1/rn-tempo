import type { RequestEntry } from '../api/types';

/** The server keeps the last 500 entries, so the view does too. */
export const MAX_ENTRIES = 500;

export type StatusFilter = 'all' | '2xx' | '3xx' | '4xx' | '5xx';

export interface Filters {
  /** `all` or an upper-case method. */
  method: string;
  status: StatusFilter;
  /** Case-insensitive text that must appear in the URL. */
  text: string;
}

export const NO_FILTERS: Filters = { method: 'all', status: 'all', text: '' };

const sameEntry = (a: RequestEntry, b: RequestEntry): boolean => a.id === b.id && a.at === b.at;

/**
 * Adds an entry at the end, ignoring one already seen (the server replays its log on every
 * reconnect) and dropping the oldest beyond the cap. A restarted server counts ids from 1 again, so
 * the timestamp is part of the identity.
 */
export function addEntry(entries: readonly RequestEntry[], entry: RequestEntry): RequestEntry[] {
  if (entries.some((existing) => sameEntry(existing, entry))) return entries as RequestEntry[];
  const next = [...entries, entry];
  return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
}

export function statusClass(status: number): StatusFilter {
  if (status >= 500) return '5xx';
  if (status >= 400) return '4xx';
  if (status >= 300) return '3xx';
  return '2xx';
}

export function filterEntries(entries: readonly RequestEntry[], filters: Filters): RequestEntry[] {
  const text = filters.text.trim().toLowerCase();
  return entries.filter(
    (entry) =>
      (filters.method === 'all' || entry.method === filters.method) &&
      (filters.status === 'all' || statusClass(entry.status) === filters.status) &&
      (text === '' || entry.url.toLowerCase().includes(text)),
  );
}

/** The distinct methods seen so far, for the filter's options. */
export function methodsSeen(entries: readonly RequestEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.method))].sort();
}

/** A body for the detail view: JSON indented, a cut body (a string with `truncated`) as text. */
export function bodyText(value: unknown, truncated: boolean | undefined): string {
  if (value === undefined) return '(empty)';
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return truncated === true ? `${text}\n… (cut by the server: the body is too long)` : text;
}
