import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { WEB_CAPABILITIES } from '../api/client';
import type { HttpRequest, ImportPreview } from '../api/types';
import { RoleProvider } from '../hooks/team';
import { adminRoutes, makeApi, renderWithApi } from '../test/fakeApi';

import { Endpoints } from './Endpoints';

const schemaBody = { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 2 }, tag: { type: ['string', 'null'] } } };
const definition = {
  name: 'shop',
  endpoints: [
    {
      id: 'createPet',
      type: 'static',
      method: 'POST',
      path: '/pets',
      summary: 'Create a pet',
      status: 201,
      body: { id: 1 },
      request: { body: schemaBody, bodyRequired: true },
      scenarios: {
        '201 created': { status: 201, description: 'Created', schema: { type: 'object', properties: { id: { type: 'integer' } } }, body: { id: 1 } },
        '422 validationFailed': { status: 422, description: 'Validation failed', schema: { type: 'object', properties: { message: { type: 'string' } } }, body: { message: 'bad' } },
      },
    },
    { id: 'plain', type: 'static', method: 'GET', path: '/plain', status: 200, body: {} },
  ],
};

const entry = (id: string, method = 'GET', extra: Record<string, unknown> = {}) => ({ id, method, path: `/${id}`, tags: ['pets'], ...extra });
const preview: ImportPreview = {
  source: 'petstore.json',
  format: 'swagger-2.0',
  hash: 'abc123',
  title: 'Pet Shop',
  total: 4,
  byTag: { pets: 3, photos: 1 },
  warnings: ['Webhooks are not supported and were skipped.'],
  firstImport: false,
  diff: {
    added: [entry('listStores'), entry('addStore', 'POST')],
    removed: [entry('deletePet', 'DELETE')],
    changed: [entry('listPets', 'GET', { customized: true, changes: ['scenario added: 429 tooManyRequests'] }), entry('createPet', 'POST', { customized: false, changes: ['request.body'] })],
    unchanged: [entry('same')],
    skipped: [],
  },
};

function setup(options: { role?: 'viewer' | 'editor'; web?: boolean; previewAnswer?: unknown; file?: { name: string; text: string } | null } = {}) {
  const calls: { previews: HttpRequest[]; applies: HttpRequest[] } = { previews: [], applies: [] };
  const api = makeApi({
    ...(options.web === true ? { capabilities: WEB_CAPABILITIES } : {}),
    pickApiFile: () => Promise.resolve(options.file === undefined ? { name: 'petstore.json', text: '{"swagger":"2.0"}' } : options.file),
    admin: adminRoutes({
      'GET /definition': () => definition,
      'GET /scenarios': () => ({ active: {}, endpoints: [] }),
      'POST /import/preview': (request) => {
        calls.previews.push(request);
        return options.previewAnswer ?? preview;
      },
      'POST /import/apply': (request) => {
        calls.applies.push(request);
        return { ok: true, applied: { added: ['listStores', 'addStore'], removed: [], taken: ['createPet'], kept: ['listPets'], merged: [] }, notes: [], warnings: [] };
      },
    }),
  });
  renderWithApi(
    <RoleProvider role={options.role ?? 'editor'}>
      <Endpoints backend="/work/shop" />
    </RoleProvider>,
    api,
  );
  return { api, calls };
}

const bodyOf = (request: HttpRequest | undefined): Record<string, unknown> => JSON.parse(request?.body ?? '{}') as Record<string, unknown>;

describe('AC-LP-5 importing an API file in the dashboard', () => {
  it('AC-LP-5 chooses a file, shows counts per tag, warnings and the diff, and applies the default choices', async () => {
    const { calls } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Import API file…' }));
    const dialog = screen.getByRole('dialog', { name: 'Import an API file' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Choose a file…' }));
    const review = await screen.findByRole('dialog', { name: 'Review the import' });
    expect(bodyOf(calls.previews[0])).toEqual({ text: '{"swagger":"2.0"}', name: 'petstore.json' });
    const tags = within(review).getByRole('table', { name: 'Endpoints per tag' });
    expect(within(tags).getByRole('row', { name: /pets 3/ })).toBeInTheDocument();
    expect(within(tags).getByRole('row', { name: /photos 1/ })).toBeInTheDocument();
    expect(within(review).getByRole('list', { name: 'Warnings' })).toHaveTextContent('Webhooks');
    expect(within(review).getByRole('region', { name: 'New endpoints' })).toHaveTextContent('/listStores');
    expect(within(review).getByRole('region', { name: 'Changed endpoints' })).toHaveTextContent('scenario added: 429 tooManyRequests');
    expect(within(review).getByText('you edited it')).toBeInTheDocument();
    expect(within(review).getByRole('combobox', { name: 'What to do with GET /listPets' })).toHaveValue('keep-mine');
    expect(within(review).getByRole('combobox', { name: 'What to do with POST /createPet' })).toHaveValue('take-new');
    expect(within(review).getByRole('checkbox', { name: 'Delete DELETE /deletePet' })).not.toBeChecked();
    await userEvent.click(within(review).getByRole('button', { name: /^Apply/ }));
    await waitFor(() => { expect(calls.applies).toHaveLength(1); });
    expect(bodyOf(calls.applies[0])).toMatchObject({
      text: '{"swagger":"2.0"}',
      expectHash: 'abc123',
      choices: { add: { listStores: true, addStore: true }, remove: { deletePet: false }, change: { listPets: 'keep-mine', createPet: 'take-new' } },
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Imported: 2 added, 1 changed, 0 removed.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('AC-LP-5 sends the choices made per endpoint and the select-all helpers', async () => {
    const { calls } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Import API file…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Choose a file…' }));
    const review = await screen.findByRole('dialog', { name: 'Review the import' });
    await userEvent.click(within(review).getByRole('button', { name: 'Select none' }));
    await userEvent.click(within(review).getByRole('checkbox', { name: 'Add GET /listStores' }));
    await userEvent.click(within(review).getByRole('button', { name: 'Delete all' }));
    await userEvent.selectOptions(within(review).getByRole('combobox', { name: 'What to do with GET /listPets' }), 'merge');
    await userEvent.click(within(review).getByRole('button', { name: 'Take the new one for all' }));
    await userEvent.selectOptions(within(review).getByRole('combobox', { name: 'What to do with POST /createPet' }), 'keep-mine');
    expect(within(review).getByRole('button', { name: 'Apply (1 added, 1 changed, 1 deleted)' })).toBeInTheDocument();
    await userEvent.click(within(review).getByRole('button', { name: /^Apply/ }));
    await waitFor(() => { expect(calls.applies).toHaveLength(1); });
    expect(bodyOf(calls.applies[0]).choices).toEqual({ add: { listStores: true, addStore: false }, remove: { deletePet: true }, change: { listPets: 'take-new', createPet: 'keep-mine' } });
  });

  it('AC-LP-5 previews an address and applies it by address', async () => {
    const { calls } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Import API file…' }));
    await userEvent.type(screen.getByLabelText('From URL'), 'https://example.com/openapi.json');
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    const review = await screen.findByRole('dialog', { name: 'Review the import' });
    expect(bodyOf(calls.previews[0])).toEqual({ url: 'https://example.com/openapi.json' });
    await userEvent.click(within(review).getByRole('button', { name: /^Apply/ }));
    await waitFor(() => { expect(calls.applies).toHaveLength(1); });
    expect(bodyOf(calls.applies[0])).toMatchObject({ url: 'https://example.com/openapi.json', expectHash: 'abc123' });
    expect(bodyOf(calls.applies[0])).not.toHaveProperty('text');
  });

  it('AC-LP-5 says what is wrong when the engine refuses the file, and goes back from the review', async () => {
    setup({ previewAnswer: { status: 400, body: JSON.stringify({ detail: 'This is not an OpenAPI or Swagger file.' }), ms: 1, contentType: 'application/problem+json' } });
    await userEvent.click(await screen.findByRole('button', { name: 'Import API file…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Choose a file…' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This is not an OpenAPI or Swagger file.');
    expect(screen.getByRole('dialog', { name: 'Import an API file' })).toBeInTheDocument();
  });

  it('AC-LP-5 goes back from the review to the file choice, and a cancelled dialog sends nothing', async () => {
    const { calls } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Import API file…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Choose a file…' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Back' }));
    expect(screen.getByRole('dialog', { name: 'Import an API file' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(calls.applies).toHaveLength(0);
  });

  it('AC-LP-5 accepts a file dropped in the browser, and shows no drop area in the desktop app', async () => {
    const { calls } = setup({ web: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Import API file…' }));
    const zone = screen.getByRole('region', { name: 'Drop an API file here' });
    const file = new File(['openapi: 3.0.3'], 'api.yaml', { type: 'application/yaml' });
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    await screen.findByRole('dialog', { name: 'Review the import' });
    expect(bodyOf(calls.previews[0])).toEqual({ text: 'openapi: 3.0.3', name: 'api.yaml' });
  });

  it('AC-LP-5 shows no drop area in the desktop app', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Import API file…' }));
    expect(screen.queryByRole('region', { name: 'Drop an API file here' })).not.toBeInTheDocument();
  });

  it('AC-LP-5 does not offer the import to a viewer', async () => {
    setup({ role: 'viewer' });
    await screen.findByRole('cell', { name: '/pets' });
    expect(screen.queryByRole('button', { name: 'Import API file…' })).not.toBeInTheDocument();
  });
});

describe('AC-LP-5 endpoint detail', () => {
  it('AC-LP-5 shows the request schema, each response with its schema and example, as a tree or raw JSON', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Details of POST /pets' }));
    const dialog = screen.getByRole('dialog', { name: 'POST /pets' });
    const request = within(dialog).getByRole('region', { name: 'Request' });
    const tree = within(request).getByRole('list', { name: 'Body (required) (tree)' });
    expect(tree).toHaveTextContent('name');
    expect(tree).toHaveTextContent('string | null');
    expect(tree).toHaveTextContent('at least 2 characters');
    await userEvent.click(within(request).getByRole('button', { name: 'Show the raw JSON of Body (required)' }));
    expect(within(request).getByText(/"minLength": 2/)).toBeInTheDocument();
    const missing = within(dialog).getByRole('group', { name: 'Response 422 validationFailed' });
    expect(within(missing).getByText('422')).toBeInTheDocument();
    expect(within(missing).getByRole('list', { name: 'Schema of 422 validationFailed (tree)' })).toHaveTextContent('message');
    await userEvent.click(within(missing).getByText('Example'));
    expect(within(missing).getByText(/"message": "bad"/)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('AC-LP-5 offers details only for an endpoint that has a schema or a described response', async () => {
    setup();
    await screen.findByRole('cell', { name: '/plain' });
    expect(screen.queryByRole('button', { name: 'Details of GET /plain' })).not.toBeInTheDocument();
  });
});
