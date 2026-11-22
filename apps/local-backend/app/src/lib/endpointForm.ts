import type { CollectionDef, CrudAction, EndpointDef, EndpointType, HttpMethodName, Scenario } from '../api/types';
import { headersFromRows, rowsFromHeaders, type HeaderRows } from '../ui/HeadersEditor';

import { writeText } from './jsonForm';
import { blankLatency, blankNetwork, latencyFormFrom, latencyFrom, MAX_DELAY_MS, networkFormFrom, networkFrom, type LatencyForm, type NetworkForm } from './network';

export const ENDPOINT_TYPES: { value: EndpointType; label: string; hint: string }[] = [
  { value: 'crud', label: 'Collection (list, get, create...)', hint: 'Serves a collection of records from the database.' },
  { value: 'static', label: 'Fixed answer', hint: 'Always answers with the status and JSON you write.' },
  { value: 'auth', label: 'Sign-in', hint: 'Login, refresh, profile and the other sign-in steps, for the app users.' },
  { value: 'users', label: 'Users', hint: 'Add, update or read an app user.' },
  { value: 'upload', label: 'File upload', hint: 'Accepts a file and stores it in Media.' },
  { value: 'download', label: 'File download', hint: 'Sends back a stored file by its id.' },
  { value: 'handler', label: 'Custom code', hint: 'Runs a JavaScript file you write. Only for backends you trust.' },
  { value: 'sse', label: 'Live events (SSE)', hint: 'A stream of server-sent events: a script of messages and the data changes you pick, to every connected app.' },
];

export const CRUD_ACTIONS: { value: CrudAction; label: string; method: HttpMethodName }[] = [
  { value: 'list', label: 'List records', method: 'GET' },
  { value: 'get', label: 'Get one record', method: 'GET' },
  { value: 'create', label: 'Create a record', method: 'POST' },
  { value: 'update', label: 'Update a record', method: 'PUT' },
  { value: 'delete', label: 'Delete a record', method: 'DELETE' },
];

export const AUTH_ACTIONS: { value: string; label: string; method: HttpMethodName; path: string; bearer: boolean }[] = [
  { value: 'login', label: 'Log in', method: 'POST', path: '/auth/login', bearer: false },
  { value: 'refresh', label: 'Refresh the token', method: 'POST', path: '/auth/refresh', bearer: false },
  { value: 'me', label: 'Who am I', method: 'GET', path: '/auth/me', bearer: true },
  { value: 'updateMe', label: 'Update my profile', method: 'PATCH', path: '/auth/me', bearer: true },
  { value: 'logout', label: 'Log out', method: 'POST', path: '/auth/logout', bearer: true },
  { value: 'register', label: 'Register', method: 'POST', path: '/auth/register', bearer: false },
  { value: 'forgotPassword', label: 'Forgot password', method: 'POST', path: '/auth/forgot-password', bearer: false },
  { value: 'otpVerify', label: 'Check a one-time code', method: 'POST', path: '/auth/otp/verify', bearer: false },
  { value: 'otpResend', label: 'Send the code again', method: 'POST', path: '/auth/otp/resend', bearer: false },
];

export const USER_ACTIONS: { value: 'add' | 'update' | 'get'; label: string; method: HttpMethodName; path: string; bearer: boolean }[] = [
  { value: 'add', label: 'Add a user', method: 'POST', path: '/users/add', bearer: false },
  { value: 'update', label: 'Update a user', method: 'PUT', path: '/users/:id', bearer: true },
  { value: 'get', label: 'Get a user', method: 'GET', path: '/users/:id', bearer: true },
];

export const METHODS: HttpMethodName[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** One canned response of the endpoint, as text. `original` keeps what the form does not show (headers, description, schema). */
export interface ScenarioForm {
  name: string;
  status: string;
  delayMs: string;
  body: string;
  /** The saved body text, for "Show changes". */
  savedBody: string | undefined;
  original?: Scenario;
}

/** Everything the form edits, as text the inputs can hold. */
export interface EndpointForm {
  type: EndpointType;
  method: HttpMethodName;
  path: string;
  summary: string;
  auth: 'none' | 'bearer';
  // collection
  collection: string;
  crudAction: CrudAction;
  listShape: 'dummyjson' | 'paged';
  searchFields: string[];
  ownerField: string;
  // fixed answer
  status: string;
  body: string;
  // sign-in and users
  action: string;
  // upload
  maxMb: string;
  multiple: boolean;
  // custom code
  file: string;
  timeoutMs: string;
  // live events (SSE)
  /** The script, as JSON text: a list of `{ event?, data, delayMs?, repeat? }`. */
  script: string;
  /** Events to forward, one per line or separated by commas. */
  on: string;
  retryMs: string;
  heartbeatMs: string;
  // every type: how the answer is shaped and how slow it is
  /** `inherit` (the backend's wrapper), `none`, or the name of a response template. */
  wrap: string;
  headers: HeaderRows;
  latency: LatencyForm;
  network: NetworkForm;
  scenarios: ScenarioForm[];
}

export function blankForm(type: EndpointType, collections: CollectionDef[]): EndpointForm {
  const form: EndpointForm = {
    type,
    method: 'GET',
    path: '',
    summary: '',
    auth: 'none',
    collection: collections[0]?.name ?? '',
    crudAction: 'list',
    listShape: 'dummyjson',
    searchFields: [],
    ownerField: '',
    status: '200',
    body: '{\n  "ok": true\n}',
    action: 'login',
    maxMb: '',
    multiple: false,
    file: 'handlers/hello.js',
    timeoutMs: '5000',
    script: '[\n  { "event": "hello", "data": { "message": "connected" } }\n]',
    on: '',
    retryMs: '3000',
    heartbeatMs: '15000',
    wrap: 'inherit',
    headers: [],
    latency: blankLatency('inherit'),
    network: blankNetwork('inherit'),
    scenarios: [],
  };
  return suggest({ ...form, path: '' }, true);
}

/** The method and path that usually go with the chosen type and action. `force` also replaces a path that is already set. */
export function suggest(form: EndpointForm, force = false): EndpointForm {
  const next = { ...form };
  if (form.type === 'crud') {
    const action = CRUD_ACTIONS.find((item) => item.value === form.crudAction);
    if (action !== undefined && !(form.crudAction === 'update' && form.method === 'PATCH')) next.method = action.method;
    if (force || form.path === '') {
      const base = form.collection === '' ? '' : `/${form.collection}`;
      next.path = form.crudAction === 'list' || form.crudAction === 'create' ? base : `${base}/:id`;
    }
  } else if (form.type === 'auth') {
    const action = AUTH_ACTIONS.find((item) => item.value === form.action);
    if (action !== undefined) {
      next.method = action.method;
      if (force || form.path === '') next.path = action.path;
      next.auth = action.bearer ? 'bearer' : 'none';
    }
  } else if (form.type === 'users') {
    const action = USER_ACTIONS.find((item) => item.value === form.action);
    if (action !== undefined) {
      next.method = action.method;
      if (force || form.path === '') next.path = action.path;
      next.auth = action.bearer ? 'bearer' : 'none';
    }
  } else if (form.type === 'sse') {
    next.method = 'GET';
    if (force || form.path === '') next.path = '/events';
  } else if (form.type === 'upload') {
    next.method = 'POST';
    if (force || form.path === '') next.path = '/media/upload';
  } else if (form.type === 'download') {
    next.method = 'GET';
    if (force || form.path === '') next.path = '/media/:id';
  }
  return next;
}

/** Changing the type resets what belongs to the type and keeps what is common. */
export function changeType(form: EndpointForm, type: EndpointType, collections: CollectionDef[]): EndpointForm {
  const fresh = blankForm(type, collections);
  const action = type === 'auth' ? 'login' : type === 'users' ? 'add' : fresh.action;
  // What every type shares (the answer's shape, speed and scenarios) survives the change.
  const shared = { wrap: form.wrap, headers: form.headers, latency: form.latency, network: form.network, scenarios: form.scenarios };
  return suggest({ ...fresh, ...shared, action, summary: form.summary, auth: fresh.auth }, true);
}

function scenarioFormFrom(name: string, scenario: Scenario): ScenarioForm {
  const body = scenario.body === undefined ? '' : writeText(scenario.body);
  return { name, status: scenario.status === undefined ? '' : String(scenario.status), delayMs: scenario.delayMs === undefined ? '' : String(scenario.delayMs), body, savedBody: scenario.body === undefined ? undefined : body, original: scenario };
}

export function blankScenario(name: string): ScenarioForm {
  return { name, status: '', delayMs: '', body: '', savedBody: undefined };
}

export function formFrom(endpoint: EndpointDef, collections: CollectionDef[]): EndpointForm {
  const form: EndpointForm = {
    ...blankForm(endpoint.type, collections),
    type: endpoint.type,
    method: endpoint.method,
    path: endpoint.path,
    summary: endpoint.summary ?? '',
    auth: endpoint.auth ?? 'none',
    wrap: endpoint.wrap ?? 'inherit',
    headers: rowsFromHeaders(endpoint.headers),
    latency: latencyFormFrom(endpoint.latency, 'inherit'),
    network: networkFormFrom(endpoint.network, 'inherit'),
    scenarios: Object.entries(endpoint.scenarios ?? {}).map(([name, scenario]) => scenarioFormFrom(name, scenario)),
  };
  switch (endpoint.type) {
    case 'crud':
      return {
        ...form,
        collection: endpoint.collection,
        crudAction: endpoint.action,
        listShape: endpoint.listShape ?? 'dummyjson',
        searchFields: endpoint.searchFields ?? [],
        ownerField: endpoint.ownerField ?? '',
      };
    case 'static':
      return { ...form, status: String(endpoint.status ?? 200), body: endpoint.body === undefined ? '' : JSON.stringify(endpoint.body, null, 2) };
    case 'auth':
    case 'users':
      return { ...form, action: endpoint.action };
    case 'upload':
      return { ...form, maxMb: endpoint.maxBytes === undefined ? '' : String(Math.round(endpoint.maxBytes / 1024 / 1024)), multiple: endpoint.multiple ?? false };
    case 'handler':
      return { ...form, file: endpoint.file, timeoutMs: String(endpoint.timeoutMs ?? 5000) };
    case 'sse':
      return {
        ...form,
        script: JSON.stringify(endpoint.script ?? [], null, 2),
        on: (endpoint.on ?? []).join('\n'),
        retryMs: String(endpoint.retryMs ?? 3000),
        heartbeatMs: String(endpoint.heartbeatMs ?? 15_000),
      };
    case 'download':
      return form;
  }
}

/** The events of the "forward" box: one per line or comma. */
export const eventsFromText = (text: string): string[] => text.split(/[\s,]+/).filter((item) => item !== '');

/** A JSON list written as text, or why it is not one. */
export function listProblem(text: string, what: string): string | undefined {
  try {
    return Array.isArray(JSON.parse(text)) ? undefined : `${what} is a JSON list: [ ... ].`;
  } catch {
    return `${what} is not valid JSON.`;
  }
}

export interface FormProblem {
  field: string;
  message: string;
}

/** Quick checks that save a round trip. The engine checks everything again and its message is shown as it is. */
export function problemsOf(form: EndpointForm): FormProblem[] {
  const found: FormProblem[] = [];
  if (!/^\/[^\s?#]*$/.test(form.path)) found.push({ field: 'path', message: 'A path starts with "/" and has no spaces, "?" or "#".' });
  if (form.type === 'crud' && form.collection === '') found.push({ field: 'collection', message: 'Pick a collection. Add one in the Data tab first.' });
  if (form.type === 'static') {
    const status = Number(form.status);
    if (!Number.isInteger(status) || status < 100 || status > 599) found.push({ field: 'status', message: 'The status is a number from 100 to 599.' });
    if (form.body.trim() !== '') {
      try {
        JSON.parse(form.body);
      } catch {
        found.push({ field: 'body', message: 'The body is not valid JSON.' });
      }
    }
  }
  if (form.type === 'sse') {
    const script = listProblem(form.script, 'The script');
    if (script !== undefined) found.push({ field: 'script', message: script });
    if (!/^\d{1,6}$/.test(form.retryMs)) found.push({ field: 'retryMs', message: 'The retry time is a number of milliseconds.' });
    if (!/^\d{1,6}$/.test(form.heartbeatMs)) found.push({ field: 'heartbeatMs', message: 'The heartbeat is a number of milliseconds (0 turns it off).' });
    if (eventsFromText(form.on).some((item) => !/^(?:\*|[A-Za-z][A-Za-z0-9_.:-]{0,63}\*?)$/.test(item))) found.push({ field: 'on', message: 'An event is a name like products.created, a prefix like products.* or *.' });
  }
  if (form.type === 'upload' && form.maxMb !== '' && !(Number(form.maxMb) > 0)) found.push({ field: 'maxMb', message: 'The size limit is a number of megabytes.' });
  if (form.type === 'handler') {
    if (!/^handlers\/[A-Za-z0-9_][A-Za-z0-9_.-]*\.(js|mjs|cjs)$/.test(form.file)) found.push({ field: 'file', message: 'A handler file looks like handlers/name.js.' });
    const timeout = Number(form.timeoutMs);
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 30000) found.push({ field: 'timeoutMs', message: 'The time limit is 1 to 30000 milliseconds.' });
  }
  const latency = latencyFrom(form.latency);
  if (!latency.ok) found.push({ field: 'latency', message: latency.message });
  const network = networkFrom(form.network);
  if (!network.ok) found.push({ field: 'network', message: network.message });
  const seen = new Set<string>();
  form.scenarios.forEach((scenario, index) => {
    const at = (key: string): string => `scenarios.${String(index)}.${key}`;
    const name = scenario.name.trim();
    if (name === '') found.push({ field: at('name'), message: 'A scenario needs a name.' });
    else if (seen.has(name)) found.push({ field: at('name'), message: `There is already a scenario named "${name}".` });
    seen.add(name);
    if (scenario.status.trim() !== '' && !(Number.isInteger(Number(scenario.status)) && Number(scenario.status) >= 100 && Number(scenario.status) <= 599)) found.push({ field: at('status'), message: 'The status is a number from 100 to 599.' });
    if (scenario.delayMs.trim() !== '' && !(/^\d{1,6}$/.test(scenario.delayMs.trim()) && Number(scenario.delayMs) <= MAX_DELAY_MS)) found.push({ field: at('delayMs'), message: `The delay is a number of milliseconds from 0 to ${String(MAX_DELAY_MS)}.` });
    if (scenario.body.trim() !== '') {
      try {
        JSON.parse(scenario.body);
      } catch {
        found.push({ field: at('body'), message: 'The body is not valid JSON.' });
      }
    }
  });
  return found;
}

/** A stable id for a new endpoint, such as `get.products.:id`, made unique among the existing ones. */
export function newId(method: string, path: string, taken: ReadonlySet<string>): string {
  const base = `${method.toLowerCase()}.${path.replace(/^\//, '').replace(/\//g, '.') || 'root'}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}.${String(n)}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** The scenario a form describes: what it edits on top of what it does not show. */
function scenarioFrom(form: ScenarioForm): Scenario {
  const kept = Object.fromEntries(Object.entries(form.original ?? {}).filter(([key]) => key !== 'status' && key !== 'delayMs' && key !== 'body'));
  return {
    ...kept,
    ...(form.status.trim() === '' ? {} : { status: Number(form.status) }),
    ...(form.delayMs.trim() === '' ? {} : { delayMs: Number(form.delayMs) }),
    ...(form.body.trim() === '' ? {} : { body: JSON.parse(form.body) as unknown }),
  };
}

/** Settings that belong to every type and survive a change of type. */
const COMMON_KEPT = ['aliases', 'tags', 'scenarios'] as const;

/**
 * The endpoint the form describes. When editing, the settings the form does not show (aliases, tags, scenarios,
 * hidden fields, the list limit...) stay as they were. Changing the type keeps only what every type shares.
 */
export function endpointFrom(form: EndpointForm, id: string, original?: EndpointDef): EndpointDef {
  const base: Record<string, unknown> =
    original === undefined
      ? {}
      : original.type === form.type
        ? { ...original }
        : Object.fromEntries(Object.entries(original).filter(([key]) => (COMMON_KEPT as readonly string[]).includes(key)));
  const merged: Record<string, unknown> = { ...base, id, type: form.type, method: form.method, path: form.path, auth: form.auth };
  const changes = new Map<string, unknown>();
  const set = (key: string, value: unknown): void => {
    changes.set(key, value);
  };
  set('summary', form.summary.trim() === '' ? undefined : form.summary.trim());
  set('wrap', form.wrap === 'inherit' ? undefined : form.wrap);
  set('headers', headersFromRows(form.headers));
  const latency = latencyFrom(form.latency);
  set('latency', latency.ok ? latency.value : undefined);
  const network = networkFrom(form.network);
  set('network', network.ok ? network.value : undefined);
  const scenarios = Object.fromEntries(form.scenarios.map((scenario) => [scenario.name.trim(), scenarioFrom(scenario)]));
  set('scenarios', Object.keys(scenarios).length === 0 ? undefined : scenarios);
  switch (form.type) {
    case 'crud':
      set('collection', form.collection);
      set('action', form.crudAction);
      set('listShape', form.crudAction === 'list' ? form.listShape : undefined);
      set('searchFields', form.crudAction === 'list' && form.searchFields.length > 0 ? form.searchFields : undefined);
      set('ownerField', form.ownerField === '' ? undefined : form.ownerField);
      break;
    case 'static':
      set('status', Number(form.status));
      set('body', form.body.trim() === '' ? undefined : (JSON.parse(form.body) as unknown));
      break;
    case 'auth':
    case 'users':
      set('action', form.action);
      break;
    case 'upload':
      set('multiple', form.multiple);
      set('maxBytes', form.maxMb === '' ? undefined : Math.round(Number(form.maxMb) * 1024 * 1024));
      break;
    case 'handler':
      set('file', form.file);
      set('timeoutMs', Number(form.timeoutMs));
      break;
    case 'sse':
      set('script', listProblem(form.script, '') === undefined ? (JSON.parse(form.script) as unknown) : []);
      set('on', eventsFromText(form.on));
      set('retryMs', Number(form.retryMs));
      set('heartbeatMs', Number(form.heartbeatMs));
      break;
    case 'download':
      break;
  }
  // A value of `undefined` means "leave this setting out".
  const out = Object.fromEntries([...Object.entries(merged).filter(([key]) => !changes.has(key)), ...[...changes].filter(([, value]) => value !== undefined)]);
  return out as unknown as EndpointDef;
}
