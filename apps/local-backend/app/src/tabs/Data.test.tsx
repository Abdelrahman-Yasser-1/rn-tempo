import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { HttpRequest } from '../api/types';
import { adminRoutes, makeApi, reply, renderWithApi } from '../test/fakeApi';

import { Data } from './Data';

const collections = [
  {
    name: 'products',
    rows: 2,
    fields: [
      { name: 'title', type: 'string', required: true },
      { name: 'price', type: 'number' },
      { name: 'active', type: 'boolean' },
      { name: 'kind', type: 'enum', enumValues: ['new', 'used'] },
    ],
  },
  { name: 'orders', rows: 0, fields: [] },
];
const rows = [
  { id: 1, title: 'Lamp', price: 9.5, active: true, kind: 'new' },
  { id: 2, title: 'Desk', price: 80, active: false, kind: null },
];

function setup(extra: Record<string, (r: HttpRequest, p: Record<string, string>) => unknown> = {}) {
  const seen: HttpRequest[] = [];
  const log = (answer: unknown) => (request: HttpRequest) => (seen.push(request), answer);
  const api = makeApi({
    admin: adminRoutes({
      'GET /collections': () => collections,
      'GET /data/products': () => ({ rows, total: 2, skip: 0, limit: 25 }),
      'POST /data/products': log({ id: 3 }),
      'PUT /data/products/:id': log({ id: 1 }),
      'DELETE /data/products/:id': log({ id: 1 }),
      'POST /collections/products/fields': log({ ok: true }),
      'DELETE /collections/products/fields/:field': log({ ok: true }),
      'POST /collections': log({ ok: true }),
      ...extra,
    }),
  });
  renderWithApi(<Data backend="/work/shop" />, api);
  return { api, seen };
}

describe('Data', () => {
  it('lists collections with their counts and the records of the first one', async () => {
    setup();
    expect(await screen.findByRole('cell', { name: 'Lamp' })).toBeInTheDocument();
    const list = screen.getByRole('complementary', { name: 'Collections' });
    expect(within(list).getByText('products')).toBeInTheDocument();
    expect(within(list).getByText('orders')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'price' })).toBeInTheDocument();
  });

  it('searches the text fields', async () => {
    const { api } = setup();
    await screen.findByRole('cell', { name: 'Lamp' });
    await userEvent.type(screen.getByRole('searchbox'), 'lam');
    await waitFor(() => {
      expect(vi.mocked(api.admin).mock.calls.some(([, request]) => request.path.includes('&q=lam'))).toBe(true);
    });
  });

  it('adds a record with a form made from the fields', async () => {
    const { seen } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Add record' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a record to products' });
    expect(within(dialog).getByLabelText('title *')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('active')).toHaveAttribute('type', 'checkbox');
    expect(within(dialog).getByLabelText('kind')).toBeInTheDocument();
    // A missing required field is named without asking the engine.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add record' }));
    expect(await within(dialog).findByText('Required.')).toBeInTheDocument();
    expect(seen).toHaveLength(0);
    await userEvent.type(within(dialog).getByLabelText('title *'), 'Chair');
    await userEvent.type(within(dialog).getByLabelText('price'), '25');
    await userEvent.selectOptions(within(dialog).getByLabelText('kind'), 'used');
    await userEvent.click(within(dialog).getByLabelText('active'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add record' }));
    await waitFor(() => {
      expect(seen).toHaveLength(1);
    });
    expect(JSON.parse(seen[0]?.body ?? '{}')).toEqual({ title: 'Chair', price: 25, active: true, kind: 'used' });
  });

  it('edits a record with PUT and clears an emptied optional field', async () => {
    const { seen } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit record 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit record 1' });
    expect(within(dialog).getByLabelText('title *')).toHaveValue('Lamp');
    await userEvent.clear(within(dialog).getByLabelText('price'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save record' }));
    await waitFor(() => {
      expect(seen).toHaveLength(1);
    });
    expect(seen[0]?.method).toBe('PUT');
    expect(JSON.parse(seen[0]?.body ?? '{}')).toMatchObject({ title: 'Lamp', price: null });
  });

  it('shows the engine message when it refuses a record', async () => {
    setup({ 'POST /data/products': () => reply({ detail: 'body.price: Must be a number.' }, 400) });
    await userEvent.click(await screen.findByRole('button', { name: 'Add record' }));
    await userEvent.type(screen.getByLabelText('title *'), 'X');
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add record' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('body.price: Must be a number.');
  });

  it('deleting a record asks first', async () => {
    const { seen } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete record 2' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this record?' });
    expect(dialog).toHaveTextContent('deleted for good');
    expect(seen).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete record' }));
    await waitFor(() => {
      expect(seen[0]?.path).toBe('/data/products/2');
    });
  });

  it('adding a field is one call; removing one that holds data asks twice and shows what is lost', async () => {
    const lost = { detail: 'This change deletes data. Send confirm: true to apply it.', confirmRequired: true, lost: [{ kind: 'field', collection: 'products', field: 'price', rows: 80 }] };
    let attempts = 0;
    const { seen } = setup({
      'DELETE /collections/products/fields/:field': (request) => {
        seen.push(request);
        attempts += 1;
        return request.path.includes('confirm=true') ? { ok: true } : reply(lost, 409);
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Edit fields' }));
    const fields = screen.getByRole('dialog', { name: 'Fields of products' });
    await userEvent.click(within(fields).getByRole('button', { name: 'Add field' }));
    const add = screen.getByRole('dialog', { name: 'Add a field' });
    await userEvent.type(within(add).getByLabelText('Name'), 'weight');
    await userEvent.selectOptions(within(add).getByLabelText('Type'), 'number');
    await userEvent.click(within(add).getByRole('button', { name: 'Add field' }));
    await waitFor(() => {
      expect(seen.some((request) => request.path === '/collections/products/fields')).toBe(true);
    });
    expect(JSON.parse(seen.find((request) => request.path === '/collections/products/fields')?.body ?? '{}')).toEqual({ name: 'weight', type: 'number' });

    await userEvent.click(within(fields).getByRole('button', { name: 'Remove price' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Remove price?' })).getByRole('button', { name: 'Remove field' }));
    const second = await screen.findByRole('dialog', { name: 'This deletes data' });
    expect(second).toHaveTextContent('The field "products.price" and its 80 saved values');
    expect(attempts).toBe(1);
    await userEvent.click(within(second).getByRole('button', { name: 'Delete it' }));
    await waitFor(() => {
      expect(attempts).toBe(2);
    });
    expect(seen.at(-1)?.path).toBe('/collections/products/fields/price?confirm=true');
  });

  it('exports JSON and CSV through a Rust save dialog', async () => {
    const { api } = setup();
    vi.mocked(api.saveExport).mockResolvedValue('/Users/me/products.csv');
    await userEvent.click(await screen.findByRole('button', { name: 'Export CSV' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved 2 records');
    expect(api.saveExport).toHaveBeenCalledWith('products', 'csv', 'id,title,price,active,kind\n1,Lamp,9.5,true,new\n2,Desk,80,false,\n');
  });

  it('imports a CSV file row by row and reports what happened', async () => {
    const { api, seen } = setup();
    vi.mocked(api.pickImportFile).mockResolvedValue({ name: 'p.csv', text: 'title,price\nA,1\nB,2\n' });
    await userEvent.click(await screen.findByRole('button', { name: 'Import…' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Imported 2 of 2 records.');
    expect(seen.map((request) => JSON.parse(request.body ?? '{}') as unknown)).toEqual([{ title: 'A', price: 1 }, { title: 'B', price: 2 }]);
  });

  it('shows the database file through Rust', async () => {
    const { api } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Show database file' }));
    expect(api.reveal).toHaveBeenCalledWith('/work/shop', 'database');
  });

  it('deleting a collection asks, then asks again with what is lost', async () => {
    const lost = { detail: 'This change deletes data.', confirmRequired: true, lost: [{ kind: 'collection', collection: 'products', rows: 2 }] };
    const calls: string[] = [];
    setup({
      'DELETE /collections/:name': (request) => {
        calls.push(request.path);
        return request.path.includes('confirm=true') ? { ok: true } : reply(lost, 409);
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete this collection' }));
    const first = screen.getByRole('dialog', { name: 'Delete the collection products?' });
    expect(first).toHaveTextContent('2 records');
    await userEvent.click(within(first).getByRole('button', { name: 'Delete collection' }));
    const second = await screen.findByRole('dialog', { name: 'This deletes data' });
    expect(second).toHaveTextContent('The collection "products" and its 2 records');
    await userEvent.click(within(second).getByRole('button', { name: 'Delete it' }));
    await waitFor(() => {
      expect(calls).toEqual(['/collections/products', '/collections/products?confirm=true']);
    });
  });

  it('makes a new collection', async () => {
    const { seen } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'New collection' }));
    await userEvent.type(screen.getByLabelText('Name'), 'notes');
    await userEvent.click(screen.getByRole('button', { name: 'Create collection' }));
    await waitFor(() => {
      expect(JSON.parse(seen[0]?.body ?? '{}')).toEqual({ name: 'notes', fields: [] });
    });
  });

  it('says what to do when a collection has no fields', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: /^orders/ }));
    expect(await screen.findByText(/no fields yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add record' })).toBeDisabled();
  });
});
