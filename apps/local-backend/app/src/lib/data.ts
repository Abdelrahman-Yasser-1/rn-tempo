export interface Collection {
  name: string;
  /** All rows the server holds. `items` may be fewer when the server caps the list. */
  total: number;
  items: Record<string, unknown>[];
}

export interface DataReply {
  collections: Collection[];
}

const MAX_COLUMNS = 8;

/** The column names: every key seen, in first-seen order, `id` first, at most 8. */
export function columnsOf(items: readonly Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  for (const item of items) for (const key of Object.keys(item)) seen.add(key);
  const keys = [...seen];
  const ordered = keys.includes('id') ? ['id', ...keys.filter((key) => key !== 'id')] : keys;
  return ordered.slice(0, MAX_COLUMNS);
}

/** One cell as text: objects and arrays as compact JSON, long text cut. */
export function cellText(value: unknown): string {
  if (value === undefined || value === null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

/** Rows whose any cell contains the text (case-insensitive). */
export function filterRows(items: readonly Record<string, unknown>[], text: string): Record<string, unknown>[] {
  const needle = text.trim().toLowerCase();
  if (needle === '') return [...items];
  return items.filter((item) => JSON.stringify(item).toLowerCase().includes(needle));
}
