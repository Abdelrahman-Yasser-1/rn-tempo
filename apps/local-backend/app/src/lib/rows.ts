import type { FieldDef } from '../api/types';

export type RowForm = Record<string, string | boolean>;

/** The empty form of a collection: booleans start unticked, everything else empty (or the default). */
export function blankRow(fields: FieldDef[]): RowForm {
  return Object.fromEntries(fields.map((field) => [field.name, field.type === 'boolean' ? field.default === true : field.default === undefined || field.default === null ? '' : display(field, field.default)]));
}

/** A value as plain text: strings as they are, numbers and booleans spelled out, anything else as JSON. */
export function scalarText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return JSON.stringify(value);
}

function display(field: FieldDef, value: unknown): string {
  if (value === null || value === undefined) return '';
  if (field.type === 'json') return JSON.stringify(value, null, 2);
  return scalarText(value);
}

export function rowToForm(fields: FieldDef[], row: Record<string, unknown>): RowForm {
  return Object.fromEntries(fields.map((field) => [field.name, field.type === 'boolean' ? row[field.name] === true : display(field, row[field.name])]));
}

export interface RowResult {
  values: Record<string, unknown>;
  problems: Record<string, string>;
}

/**
 * The values to send for a form. An empty optional field is left out when creating and sent as `null` when editing
 * (so it can be cleared). A field that cannot be read (a number that is not one, JSON that is not JSON) is a problem
 * named by field; everything else is checked by the engine.
 */
export function formToRow(fields: FieldDef[], form: RowForm, mode: 'create' | 'edit'): RowResult {
  const values: Record<string, unknown> = {};
  const problems: Record<string, string> = {};
  for (const field of fields) {
    const raw = form[field.name];
    if (field.type === 'boolean') {
      values[field.name] = raw === true;
      continue;
    }
    const text = typeof raw === 'string' ? raw.trim() : '';
    if (text === '') {
      if (field.required && field.default === undefined) problems[field.name] = 'Required.';
      else if (mode === 'edit') values[field.name] = null;
      continue;
    }
    if (field.type === 'number' || field.type === 'relation') {
      const number = Number(text);
      if (!Number.isFinite(number)) problems[field.name] = 'Must be a number.';
      else values[field.name] = number;
    } else if (field.type === 'json') {
      try {
        values[field.name] = JSON.parse(text) as unknown;
      } catch {
        problems[field.name] = 'Must be valid JSON.';
      }
    } else values[field.name] = typeof raw === 'string' ? raw : text;
  }
  return { values, problems };
}

// ---- CSV

function csvCell(value: unknown): string {
  const text = scalarText(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(fields: FieldDef[], rows: Record<string, unknown>[]): string {
  const names = ['id', ...fields.map((field) => field.name)];
  return `${[names.join(','), ...rows.map((row) => names.map((name) => csvCell(row[name])).join(','))].join('\n')}\n`;
}

/** Reads CSV text (quotes, doubled quotes, commas and line breaks inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i] ?? '';
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((items) => items.some((item) => item !== ''));
}

/** Turns an imported file (JSON array or CSV with a header row) into the rows to create, by field name. */
export function rowsFromImport(name: string, text: string, fields: FieldDef[]): { rows: Record<string, unknown>[] } | { error: string } {
  if (name.toLowerCase().endsWith('.csv')) {
    const [header, ...body] = parseCsv(text);
    if (header === undefined) return { error: 'That CSV file is empty.' };
    const known = new Map(fields.map((field) => [field.name, field]));
    const rows = body.map((cells) => {
      const row: Record<string, unknown> = {};
      header.forEach((column, index) => {
        const field = known.get(column.trim());
        const cell = cells[index] ?? '';
        if (field === undefined || cell === '') return;
        if (field.type === 'number' || field.type === 'relation') row[field.name] = Number(cell);
        else if (field.type === 'boolean') row[field.name] = cell.toLowerCase() === 'true' || cell === '1';
        else if (field.type === 'json') {
          try {
            row[field.name] = JSON.parse(cell) as unknown;
          } catch {
            row[field.name] = cell;
          }
        } else row[field.name] = cell;
      });
      return row;
    });
    return { rows };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: 'That file is not valid JSON.' };
  }
  const list: unknown = Array.isArray(parsed) ? parsed : typeof parsed === 'object' && parsed !== null && 'rows' in parsed ? parsed.rows : undefined;
  if (!Array.isArray(list) || !list.every((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))) {
    return { error: 'Expected a list of records, like [ { "title": "A" } ].' };
  }
  // An exported file carries ids; new rows get fresh ones.
  return { rows: list.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'id'))) };
}
