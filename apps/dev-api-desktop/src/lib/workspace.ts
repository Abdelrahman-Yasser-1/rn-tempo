import { WorkspaceSchema, type Workspace } from '@dev-api/workspace-schema';

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type Method = (typeof METHODS)[number];

export interface ScenarioDraft {
  name: string;
  status: string;
  delayMs: string;
  /** JSON text, or empty for none. */
  body: string;
  /** Fields the editor does not show, kept as they were. */
  extra: Record<string, unknown>;
}

export interface EndpointDraft {
  id: string;
  method: string;
  path: string;
  summary: string;
  /** Comma separated. */
  tags: string;
  bearer: boolean;
  status: string;
  /** JSON text, or empty for "generate from the schema". */
  example: string;
  scenarios: ScenarioDraft[];
  /** The endpoint as loaded: request schemas and the response schema are kept untouched. */
  original: Record<string, unknown>;
}

export interface Draft {
  name: string;
  basePath: string;
  port: string;
  endpoints: EndpointDraft[];
  original: Record<string, unknown>;
}

/** A copy of an object without some keys. */
const omit = (value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const json = (value: unknown): string => (value === undefined ? '' : JSON.stringify(value, null, 2));

/** Reads the file's text into editable fields. Throws a readable error for text that is not a workspace object. */
export function parseDraft(source: string): Draft {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error('tempo-api.json is not valid JSON.');
  }
  if (!isRecord(value)) throw new Error('tempo-api.json must hold a JSON object.');
  const endpoints = Array.isArray(value.endpoints) ? value.endpoints.filter(isRecord) : [];
  return {
    name: text(value.name),
    basePath: text(value.basePath),
    port: typeof value.port === 'number' ? String(value.port) : '',
    original: value,
    endpoints: endpoints.map((endpoint): EndpointDraft => {
      const response = isRecord(endpoint.response) ? endpoint.response : {};
      const scenarios = isRecord(endpoint.scenarios) ? endpoint.scenarios : {};
      return {
        id: text(endpoint.id),
        method: text(endpoint.method) || 'GET',
        path: text(endpoint.path),
        summary: text(endpoint.summary),
        tags: Array.isArray(endpoint.tags) ? endpoint.tags.filter((tag): tag is string => typeof tag === 'string').join(', ') : '',
        bearer: endpoint.auth === 'bearer',
        status: typeof response.status === 'number' ? String(response.status) : '200',
        example: json(response.example),
        original: endpoint,
        scenarios: Object.entries(scenarios).map(([name, scenario]) => {
          const { status, delayMs, body, ...extra } = isRecord(scenario) ? scenario : ({} as Record<string, unknown>);
          return {
            name,
            status: typeof status === 'number' ? String(status) : '',
            delayMs: typeof delayMs === 'number' ? String(delayMs) : '',
            body: json(body),
            extra,
          };
        }),
      };
    }),
  };
}

/** `get.products.:id` from a method and a path: the convention scenarios and fixtures use. */
export function suggestId(method: string, path: string): string {
  const parts = path.split('/').filter((part) => part !== '');
  return [method.toLowerCase(), ...parts].join('.');
}

export function emptyEndpoint(n: number): EndpointDraft {
  const path = `/new-${n}`;
  return { id: suggestId('GET', path), method: 'GET', path, summary: '', tags: '', bearer: false, status: '200', example: '{}', scenarios: [], original: {} };
}

export function emptyScenario(n: number): ScenarioDraft {
  return { name: `scenario${n}`, status: '500', delayMs: '', body: '', extra: {} };
}

export type DraftResult = { ok: true; workspace: Workspace } | { ok: false; errors: string[] };

function parseJsonField(source: string, label: string, errors: string[]): { value: unknown } | undefined {
  if (source.trim() === '') return undefined;
  try {
    return { value: JSON.parse(source) };
  } catch {
    errors.push(`${label}: not valid JSON`);
    return undefined;
  }
}

const numberOrNaN = (source: string): number => (source.trim() === '' ? Number.NaN : Number(source));

/** Builds the file's object from the fields and checks it with the dev API's own workspace schema. */
export function buildWorkspace(draft: Draft): DraftResult {
  const errors: string[] = [];
  const endpoints = draft.endpoints.map((endpoint, index) => {
    const label = endpoint.id === '' ? `endpoint ${index + 1}` : endpoint.id;
    const example = parseJsonField(endpoint.example, `${label} example`, errors);
    const originalResponse = isRecord(endpoint.original.response) ? endpoint.original.response : {};
    const responseRest = omit(originalResponse, ['example']);
    const scenarios: Record<string, unknown> = {};
    for (const scenario of endpoint.scenarios) {
      const body = parseJsonField(scenario.body, `${label} scenario ${scenario.name} body`, errors);
      scenarios[scenario.name] = {
        ...scenario.extra,
        ...(scenario.status.trim() === '' ? {} : { status: numberOrNaN(scenario.status) }),
        ...(scenario.delayMs.trim() === '' ? {} : { delayMs: numberOrNaN(scenario.delayMs) }),
        ...(body === undefined ? {} : { body: body.value }),
      };
    }
    const tags = endpoint.tags.split(',').map((tag) => tag.trim()).filter((tag) => tag !== '');
    const rest = omit(endpoint.original, ['auth', 'tags', 'summary', 'scenarios']);
    return {
      ...rest,
      id: endpoint.id,
      method: endpoint.method,
      path: endpoint.path,
      ...(endpoint.summary === '' ? {} : { summary: endpoint.summary }),
      ...(tags.length === 0 ? {} : { tags }),
      ...(endpoint.bearer ? { auth: 'bearer' } : {}),
      response: { ...responseRest, status: numberOrNaN(endpoint.status), ...(example === undefined ? {} : { example: example.value }) },
      ...(Object.keys(scenarios).length === 0 ? {} : { scenarios }),
    };
  });
  const topRest = omit(draft.original, ['basePath', 'port']);
  const candidate = {
    ...topRest,
    name: draft.name,
    ...(draft.basePath === '' ? {} : { basePath: draft.basePath }),
    ...(draft.port.trim() === '' ? {} : { port: numberOrNaN(draft.port) }),
    endpoints,
  };
  const ids = new Set<string>();
  for (const endpoint of draft.endpoints) {
    if (ids.has(endpoint.id)) errors.push(`${endpoint.id}: this id is used twice`);
    ids.add(endpoint.id);
  }
  const parsed = WorkspaceSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors.push(`${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  if (errors.length > 0 || !parsed.success) return { ok: false, errors };
  return { ok: true, workspace: parsed.data };
}

/** The file text for a validated workspace. */
export const serializeWorkspace = (workspace: Workspace): string => `${JSON.stringify(workspace, null, 2)}\n`;
