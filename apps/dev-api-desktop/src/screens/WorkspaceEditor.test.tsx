import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Client } from '../client/client';
import { makeClient, OK_OUTPUT, PROJECT, renderWithClient } from '../test/fakeClient';

import { WorkspaceEditor } from './WorkspaceEditor';

const WORKSPACE = { ...PROJECT, kind: 'workspace' as const, name: 'shop' };
const FILE = JSON.stringify({
  name: 'Shop',
  endpoints: [{ id: 'get.ping', method: 'GET', path: '/ping', response: { status: 200, example: { ok: true } } }],
});

function setup(overrides: Partial<Client> = {}) {
  const writeWorkspace = vi.fn<Client['writeWorkspace']>(() => Promise.resolve());
  const cli = vi.fn<Client['cli']>(() => Promise.resolve(OK_OUTPUT));
  const client = makeClient({ readWorkspace: vi.fn(() => Promise.resolve(FILE)), writeWorkspace, cli, ...overrides });
  return { writeWorkspace, cli, client };
}

describe('WorkspaceEditor', () => {
  it('loads the endpoints and saves an edit as validated JSON', async () => {
    const { writeWorkspace, client } = setup();
    renderWithClient(<WorkspaceEditor project={WORKSPACE} />, client);
    const form = await screen.findByRole('region', { name: 'Endpoint' });
    const status = within(form).getAllByLabelText('Status')[0];
    if (status === undefined) throw new Error('no status field');
    await userEvent.clear(status);
    await userEvent.type(status, '201');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writeWorkspace).toHaveBeenCalled());
    const saved = JSON.parse(writeWorkspace.mock.calls[0]?.[1] ?? '{}') as { endpoints: { response: { status: number } }[] };
    expect(saved.endpoints[0]?.response.status).toBe(201);
    expect(await screen.findByText(/Restart the server/)).toBeInTheDocument();
  });

  it('shows schema problems and does not write', async () => {
    const { writeWorkspace, client } = setup();
    renderWithClient(<WorkspaceEditor project={WORKSPACE} />, client);
    const path = await screen.findByLabelText('Path');
    await userEvent.clear(path);
    await userEvent.type(path, 'no-slash');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert', { name: 'Problems' })).toHaveTextContent('endpoints.0.path');
    expect(writeWorkspace).not.toHaveBeenCalled();
  });

  it('reports invalid example JSON', async () => {
    const { writeWorkspace, client } = setup();
    renderWithClient(<WorkspaceEditor project={WORKSPACE} />, client);
    const example = await screen.findByLabelText(/Example response/);
    await userEvent.clear(example);
    await userEvent.type(example, '{{broken');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert', { name: 'Problems' })).toHaveTextContent('example: not valid JSON');
    expect(writeWorkspace).not.toHaveBeenCalled();
  });

  it('adds an endpoint and a scenario', async () => {
    const { writeWorkspace, client } = setup();
    renderWithClient(<WorkspaceEditor project={WORKSPACE} />, client);
    await userEvent.click(await screen.findByRole('button', { name: 'Add endpoint' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add scenario' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(writeWorkspace).toHaveBeenCalled());
    const saved = JSON.parse(writeWorkspace.mock.calls[0]?.[1] ?? '{}') as { endpoints: { path: string; scenarios?: Record<string, unknown> }[] };
    expect(saved.endpoints).toHaveLength(2);
    expect(Object.keys(saved.endpoints[1]?.scenarios ?? {})).toEqual(['scenario1']);
  });

  it('imports an OpenAPI file through the CLI and reloads', async () => {
    const readWorkspace = vi.fn<Client['readWorkspace']>(() => Promise.resolve(FILE));
    const pickFile = vi.fn<Client['pickFile']>(() => Promise.resolve('/specs/shop.yaml'));
    const { cli, client } = setup({ readWorkspace, pickFile });
    renderWithClient(<WorkspaceEditor project={WORKSPACE} />, client);
    await userEvent.click(await screen.findByRole('button', { name: 'Import OpenAPI…' }));
    await waitFor(() => expect(cli).toHaveBeenCalledWith('/work/demo', { kind: 'importOpenapi', file: '/specs/shop.yaml' }));
    await waitFor(() => expect(readWorkspace.mock.calls.length).toBeGreaterThan(1));
  });

  it('does nothing when the file picker is cancelled', async () => {
    const { cli, client } = setup();
    renderWithClient(<WorkspaceEditor project={WORKSPACE} />, client);
    await userEvent.click(await screen.findByRole('button', { name: 'Import OpenAPI…' }));
    expect(cli).not.toHaveBeenCalled();
  });

  it('exports to a chosen project folder', async () => {
    const pickFolder = vi.fn<Client['pickFolder']>(() => Promise.resolve('/work/app'));
    const { cli, client } = setup({ pickFolder });
    renderWithClient(<WorkspaceEditor project={WORKSPACE} />, client);
    await userEvent.click(await screen.findByRole('button', { name: 'Export to code…' }));
    await waitFor(() => expect(cli).toHaveBeenCalledWith('/work/demo', { kind: 'exportCode', out: '/work/app', force: false }));
  });

  it('offers to overwrite when the export finds existing files', async () => {
    const pickFolder = vi.fn<Client['pickFolder']>(() => Promise.resolve('/work/app'));
    const cli = vi.fn<Client['cli']>((_path, action) =>
      Promise.resolve(action.kind === 'exportCode' && !action.force ? { code: 1, stdout: '', stderr: 'already exists' } : OK_OUTPUT),
    );
    const { client } = setup({ pickFolder, cli });
    renderWithClient(<WorkspaceEditor project={WORKSPACE} />, client);
    await userEvent.click(await screen.findByRole('button', { name: 'Export to code…' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Overwrite them' }));
    await waitFor(() => expect(cli).toHaveBeenCalledWith('/work/demo', { kind: 'exportCode', out: '/work/app', force: true }));
  });

  it('says when the file is not valid JSON', async () => {
    const { client } = setup({ readWorkspace: vi.fn(() => Promise.resolve('{oops')) });
    renderWithClient(<WorkspaceEditor project={WORKSPACE} />, client);
    expect(await screen.findByRole('alert')).toHaveTextContent('not valid JSON');
  });
});
