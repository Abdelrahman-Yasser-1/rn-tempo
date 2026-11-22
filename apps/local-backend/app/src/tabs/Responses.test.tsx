import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { HttpRequest } from '../api/types';
import { networkNote } from '../lib/requests';
import { adminRoutes, makeApi, renderWithApi, RUNNING } from '../test/fakeApi';

import { Endpoints } from './Endpoints';
import { Settings } from './Settings';

const base = { name: 'shop', port: 8556, https: true, auth: {}, media: {}, collections: [], endpoints: [] };
const bodyOf = (request: HttpRequest | undefined): Record<string, unknown> => JSON.parse(request?.body ?? '{}') as Record<string, unknown>;

function settings(definition: Record<string, unknown> = base) {
  const puts: HttpRequest[] = [];
  const api = makeApi({
    admin: adminRoutes({
      'GET /definition': () => ({ ...base, ...definition }),
      'PUT /settings/network': (request) => (puts.push(request), {}),
      'PUT /settings/responses': (request) => (puts.push(request), {}),
    }),
  });
  renderWithApi(<Settings backend={RUNNING} onOpen={() => undefined} />, api);
  return puts;
}

describe('AC-LP-6 Settings, Network', () => {
  it('AC-LP-6 saves the preset, a random default delay and test mode, and explains test mode', async () => {
    const puts = settings();
    const section = await screen.findByRole('region', { name: 'Network' });
    expect(within(section).getByText(/x-tempo-test-mode: 1/)).toBeInTheDocument();
    await userEvent.selectOptions(within(section).getByLabelText('Network'), '3g-slow');
    expect(within(section).getByText(/400 ms delay, 500 kbps/)).toBeInTheDocument();
    await userEvent.selectOptions(within(section).getByLabelText('Delay'), 'range');
    await userEvent.clear(within(section).getByLabelText('Shortest (ms)'));
    await userEvent.type(within(section).getByLabelText('Shortest (ms)'), '50');
    await userEvent.click(within(section).getByLabelText(/^Test mode/));
    await userEvent.click(within(section).getByRole('button', { name: 'Save network settings' }));
    await waitFor(() => {
      expect(puts).toHaveLength(1);
    });
    expect(puts[0]?.path).toBe('/settings/network');
    expect(bodyOf(puts[0])).toEqual({ network: { preset: '3g-slow' }, latency: { default: { minMs: 50, maxMs: 900 } }, testMode: true });
  });

  it('AC-LP-6 refuses a range that runs backwards and sends nothing', async () => {
    const puts = settings();
    const section = await screen.findByRole('region', { name: 'Network' });
    await userEvent.selectOptions(within(section).getByLabelText('Delay'), 'range');
    await userEvent.clear(within(section).getByLabelText('Shortest (ms)'));
    await userEvent.type(within(section).getByLabelText('Shortest (ms)'), '2000');
    await userEvent.click(within(section).getByRole('button', { name: 'Save network settings' }));
    expect(await within(section).findByRole('alert')).toHaveTextContent(/shortest delay cannot be longer/);
    expect(puts).toHaveLength(0);
  });

  it('AC-LP-6 shows what is saved', async () => {
    settings({ network: { preset: 'timeout', timeoutMs: 500 }, latency: { default: { fixedMs: 70 } } });
    const section = await screen.findByRole('region', { name: 'Network' });
    expect(within(section).getByLabelText('Network')).toHaveValue('timeout');
    expect(within(section).getByLabelText('Delay')).toHaveValue('fixed');
    expect(within(section).getByLabelText('Wait (ms)')).toHaveValue('70');
    expect(within(section).getByLabelText(/^Timeout after/)).toHaveValue('500');
  });
});

describe('AC-LP-6 Settings, Responses', () => {
  it('AC-LP-6 saves the wrapper, error format, common headers and a template', async () => {
    const puts = settings();
    const section = await screen.findByRole('region', { name: 'Responses' });
    await userEvent.click(within(section).getByLabelText(/^Wrap every success answer/));
    expect(JSON.parse(within(section).getByLabelText<HTMLTextAreaElement>('Success wrapper').value)).toEqual({ success: true, data: '{{body}}', message: null });
    await userEvent.selectOptions(within(section).getByLabelText('Error format'), 'dummyjson');
    await userEvent.click(within(section).getByRole('button', { name: 'Add header' }));
    await userEvent.type(within(section).getByLabelText('Common headers: name 1'), 'x-api');
    await userEvent.type(within(section).getByLabelText('Common headers: value 1'), '2');
    await userEvent.type(within(section).getByLabelText('New template name'), 'gone');
    await userEvent.click(within(section).getByRole('button', { name: 'Add template' }));
    await userEvent.type(within(section).getByLabelText('Status of gone'), '410');
    await userEvent.click(within(section).getByRole('button', { name: 'Save response settings' }));
    await waitFor(() => {
      expect(puts).toHaveLength(1);
    });
    expect(puts[0]?.path).toBe('/settings/responses');
    expect(bodyOf(puts[0])).toEqual({
      responses: { success: { success: true, data: '{{body}}', message: null }, error: { format: 'dummyjson' }, headers: { 'x-api': '2' } },
      responseTemplates: { gone: { status: 410, body: { message: '{{with.message}}' } } },
    });
  });

  it('AC-LP-6 will not save a wrapper without {{body}} or with bad JSON', async () => {
    const puts = settings();
    const section = await screen.findByRole('region', { name: 'Responses' });
    await userEvent.click(within(section).getByLabelText(/^Wrap every success answer/));
    fireEvent.input(within(section).getByLabelText('Success wrapper'), { target: { value: '{"data": 1}' } });
    await userEvent.click(within(section).getByRole('button', { name: 'Save response settings' }));
    expect(await within(section).findByRole('alert')).toHaveTextContent(/needs "\{\{body\}\}"/);
    fireEvent.input(within(section).getByLabelText('Success wrapper'), { target: { value: '{"data": ' } });
    await userEvent.click(within(section).getByRole('button', { name: 'Save response settings' }));
    expect(await within(section).findByRole('alert')).toHaveTextContent(/not valid JSON/);
    expect(puts).toHaveLength(0);
  });

  it('AC-LP-6 lists the saved templates and rejects a bad template name', async () => {
    settings({ responseTemplates: { gone: { status: 410, body: { message: 'x' } } } });
    const section = await screen.findByRole('region', { name: 'Responses' });
    expect(within(section).getByRole('group', { name: 'Template gone' })).toBeInTheDocument();
    await userEvent.type(within(section).getByLabelText('New template name'), '1bad name');
    await userEvent.click(within(section).getByRole('button', { name: 'Add template' }));
    expect(within(section).getByRole('alert')).toHaveTextContent(/starts with a letter/);
  });
});

const definition = {
  name: 'shop',
  responseTemplates: { gone: { status: 410, body: { message: 'x' } } },
  collections: [],
  endpoints: [{ id: 'get.cfg', type: 'static', method: 'GET', path: '/cfg', status: 200, body: { a: 1 }, scenarios: { empty: { status: 200, body: { a: 0 } } } }],
};

describe('AC-LP-6 endpoint form: speed, wrapper, headers, templates and scenarios', () => {
  it('AC-LP-6 saves an endpoint delay, network, wrap choice, header and an edited scenario', async () => {
    const puts: HttpRequest[] = [];
    const api = makeApi({ admin: adminRoutes({ 'GET /definition': () => definition, 'GET /scenarios': () => ({ active: {}, endpoints: [] }), 'GET /users': () => ({ users: [], total: 0, skip: 0, limit: 100 }), 'PUT /endpoints/:id': (request) => (puts.push(request), {}) }) });
    renderWithApi(<Endpoints backend="/work/shop" />, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit GET /cfg' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit endpoint' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Delay'), 'range');
    await userEvent.clear(within(dialog).getByLabelText('Shortest (ms)'));
    await userEvent.type(within(dialog).getByLabelText('Shortest (ms)'), '10');
    await userEvent.selectOptions(within(dialog).getByLabelText('Network'), '4g');
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Success wrapper/), 'none');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add header' }));
    await userEvent.type(within(dialog).getByLabelText('Headers: name 1'), 'x-id');
    await userEvent.type(within(dialog).getByLabelText('Headers: value 1'), '{{{{params.id}}');
    await userEvent.type(within(dialog).getByLabelText('Scenario 1 delay'), '250');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add scenario' }));
    await userEvent.type(within(dialog).getByLabelText('Scenario 2 name'), 'gone');
    await userEvent.type(within(dialog).getByLabelText('Scenario 2 status'), '410');
    fireEvent.input(within(dialog).getByLabelText('Scenario 2 body'), { target: { value: '{"template":"gone"}' } });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save endpoint' }));
    await waitFor(() => {
      expect(puts).toHaveLength(1);
    });
    expect(bodyOf(puts[0])).toMatchObject({
      latency: { minMs: 10, maxMs: 900 },
      network: { preset: '4g' },
      wrap: 'none',
      headers: { 'x-id': '{{params.id}}' },
      scenarios: { empty: { status: 200, delayMs: 250, body: { a: 0 } }, gone: { status: 410, body: { template: 'gone' } } },
    });
  });

  it('AC-LP-6 fills the body from a template, and lists the dynamic values in a popover', async () => {
    const api = makeApi({ admin: adminRoutes({ 'GET /definition': () => definition, 'GET /scenarios': () => ({ active: {}, endpoints: [] }), 'GET /users': () => ({ users: [], total: 0, skip: 0, limit: 100 }) }) });
    renderWithApi(<Endpoints backend="/work/shop" />, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit GET /cfg' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit endpoint' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Use template'), 'gone');
    expect(JSON.parse(within(dialog).getByLabelText<HTMLTextAreaElement>('JSON body').value)).toEqual({ template: 'gone', with: {} });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Dynamic values' }));
    const help = within(dialog).getByRole('region', { name: 'Dynamic values' });
    for (const token of ['{{params.id}}', '{{now}}', '{{uuid}}', '{{seq}}', '{{random.int 1 100}}', '{{fake.name}}']) expect(within(help).getByText(token)).toBeInTheDocument();
  });

  it('AC-LP-6 blocks a bad delay range or scenario status before saving', async () => {
    const puts: HttpRequest[] = [];
    const api = makeApi({ admin: adminRoutes({ 'GET /definition': () => definition, 'GET /scenarios': () => ({ active: {}, endpoints: [] }), 'GET /users': () => ({ users: [], total: 0, skip: 0, limit: 100 }), 'PUT /endpoints/:id': (request) => (puts.push(request), {}) }) });
    renderWithApi(<Endpoints backend="/work/shop" />, api);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit GET /cfg' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit endpoint' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Delay'), 'range');
    await userEvent.clear(within(dialog).getByLabelText('Shortest (ms)'));
    await userEvent.type(within(dialog).getByLabelText('Shortest (ms)'), '5000');
    await userEvent.clear(within(dialog).getByLabelText('Scenario 1 status'));
    await userEvent.type(within(dialog).getByLabelText('Scenario 1 status'), '99');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save endpoint' }));
    expect(await within(dialog).findByText(/shortest delay cannot be longer/)).toBeInTheDocument();
    expect(within(dialog).getByText('The status is a number from 100 to 599.')).toBeInTheDocument();
    expect(puts).toHaveLength(0);
  });
});

describe('AC-LP-6 the request log shows the delay', () => {
  it('AC-LP-6 words the applied delay and throttle', () => {
    expect(networkNote(undefined)).toBeNull();
    expect(networkNote({ delayMs: 734, delaySource: 'default' })).toBe('delayed 734 ms (default)');
    expect(networkNote({ delayMs: 30_000, delaySource: 'timeout', timedOut: true })).toMatch(/held 30000 ms, then the connection was closed/);
    expect(networkNote({ downloadKbps: 500, uploadKbps: 500, delayMs: 400, delaySource: 'preset' })).toBe('delayed 400 ms (preset), download 500 kbps, upload 500 kbps');
    expect(networkNote({ testMode: true })).toBe('test mode: no delay or throttling');
  });
});
