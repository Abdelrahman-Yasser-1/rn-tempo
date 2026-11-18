import { describe, expect, it } from 'vitest';

import type { FieldDef } from '../api/types';

import { blankRow, formToRow, parseCsv, rowsFromImport, rowToForm, toCsv } from './rows';

const fields: FieldDef[] = [
  { name: 'title', type: 'string', required: true },
  { name: 'price', type: 'number' },
  { name: 'active', type: 'boolean' },
  { name: 'meta', type: 'json' },
  { name: 'stock', type: 'number', default: 5 },
];

describe('row forms', () => {
  it('starts blank with defaults and unticked booleans', () => {
    expect(blankRow(fields)).toEqual({ title: '', price: '', active: false, meta: '', stock: '5' });
  });

  it('reads a form into values, leaving empty optional fields out on create and null on edit', () => {
    const form = { title: ' Lamp ', price: '9.5', active: true, meta: '{"a":1}', stock: '' };
    expect(formToRow(fields, form, 'create')).toEqual({ values: { title: ' Lamp ', price: 9.5, active: true, meta: { a: 1 } }, problems: {} });
    expect(formToRow(fields, { ...form, price: '' }, 'edit').values).toMatchObject({ price: null });
  });

  it('names a field that cannot be read, and a missing required one', () => {
    const result = formToRow(fields, { title: '', price: 'abc', active: false, meta: '{oops', stock: '' }, 'create');
    expect(result.problems).toEqual({ title: 'Required.', price: 'Must be a number.', meta: 'Must be valid JSON.' });
  });

  it('shows a stored row in the form', () => {
    expect(rowToForm(fields, { id: 1, title: 'A', price: 3, active: true, meta: { a: 1 }, stock: null })).toEqual({ title: 'A', price: '3', active: true, meta: '{\n  "a": 1\n}', stock: '' });
  });
});

describe('csv', () => {
  it('writes quotes and commas safely', () => {
    expect(toCsv(fields.slice(0, 2), [{ id: 1, title: 'A "big", lamp', price: 2 }])).toBe('id,title,price\n1,"A ""big"", lamp",2\n');
  });
  it('reads quotes, doubled quotes, line breaks inside quotes and CRLF', () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi""\nthere"\r\n,\n')).toEqual([['a', 'b'], ['x, y', 'he said "hi"\nthere']]);
  });
});

describe('import', () => {
  it('maps CSV columns to fields by name and converts types', () => {
    const result = rowsFromImport('p.csv', 'id,title,price,active,other\n7,Lamp,9.5,true,x\n', fields);
    expect(result).toEqual({ rows: [{ title: 'Lamp', price: 9.5, active: true }] });
  });
  it('reads a JSON list or { rows }, drops ids, and explains a bad file', () => {
    expect(rowsFromImport('p.json', '[{"id":4,"title":"A"}]', fields)).toEqual({ rows: [{ title: 'A' }] });
    expect(rowsFromImport('p.json', '{"rows":[{"title":"B"}]}', fields)).toEqual({ rows: [{ title: 'B' }] });
    expect(rowsFromImport('p.json', '{oops', fields)).toEqual({ error: 'That file is not valid JSON.' });
    expect(rowsFromImport('p.json', '{"a":1}', fields)).toEqual({ error: 'Expected a list of records, like [ { "title": "A" } ].' });
    expect(rowsFromImport('p.csv', '', fields)).toEqual({ error: 'That CSV file is empty.' });
  });
});
