import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { adminSend } from '../api/client';
import { useApi } from '../api/context';
import type { CollectionDef, EndpointDef, EndpointType, ResponseTemplateDef } from '../api/types';
import {
  AUTH_ACTIONS,
  blankForm,
  blankScenario,
  changeType,
  CRUD_ACTIONS,
  endpointFrom,
  ENDPOINT_TYPES,
  formFrom,
  METHODS,
  newId,
  problemsOf,
  suggest,
  USER_ACTIONS,
  type EndpointForm,
} from '../lib/endpointForm';
import { errorMessage } from '../lib/errors';
import { Modal } from '../ui/Modal';
import { ErrorNote, Hint } from '../ui/bits';
import { DynamicValuesHelp } from '../ui/DynamicValuesHelp';
import { HeadersEditor } from '../ui/HeadersEditor';
import { FaultsFields } from '../ui/FaultsFields';
import { LatencyFields, NetworkFields } from '../ui/NetworkFields';
import { ResponseEditor } from '../ui/ResponseEditor';

interface Props {
  backend: string;
  collections: CollectionDef[];
  existingIds: ReadonlySet<string>;
  /** The backend's response templates, to wrap with or use as a body. */
  templates?: Record<string, ResponseTemplateDef>;
  /** The endpoint being edited, or the one being copied (then `copy` is set). */
  endpoint?: EndpointDef;
  copy?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** The schema an imported file documents for the answer with this status, when there is one. */
function documentedSchema(endpoint: EndpointDef | undefined, status: string): Record<string, unknown> | undefined {
  return Object.values(endpoint?.scenarios ?? {}).find((scenario) => (scenario.status ?? 200) === Number(status) && scenario.schema !== undefined)?.schema;
}

/** One form for every endpoint type: the fields below the type change with it. */
export function EndpointDialog({ backend, collections, existingIds, templates = {}, endpoint, copy = false, onClose, onSaved }: Props) {
  const api = useApi();
  const ids = useId();
  const editing = endpoint !== undefined && !copy;
  const [form, setForm] = useState<EndpointForm>(() => {
    if (endpoint === undefined) return blankForm('crud', collections);
    const loaded = formFrom(endpoint, collections);
    return copy ? { ...loaded, path: `${loaded.path}-copy` } : loaded;
  });
  const [shown, setShown] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const set = <K extends keyof EndpointForm>(key: K, value: EndpointForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };
  const problems = problemsOf(form);
  const problem = (field: string) => (shown ? problems.find((item) => item.field === field)?.message : undefined);

  const savedBody = endpoint === undefined ? undefined : formFrom(endpoint, collections).body;
  const collection = collections.find((item) => item.name === form.collection);
  const searchable = (collection?.fields ?? []).filter((field) => field.type === 'string' || field.type === 'enum');
  const owners = (collection?.fields ?? []).filter((field) => field.type === 'number' || field.type === 'relation');

  const save = useMutation({
    mutationFn: async () => {
      const id = editing ? endpoint.id : newId(form.method, form.path, existingIds);
      const made = endpointFrom(form, id, endpoint);
      // A copy is a new endpoint of your own: it is not what an import made.
      const body = editing ? made : (Object.fromEntries(Object.entries(made).filter(([key]) => key !== 'importedFrom')) as unknown as typeof made);
      if (editing) await adminSend(api, backend, 'PUT', `/endpoints/${encodeURIComponent(id)}`, body);
      else await adminSend(api, backend, 'POST', '/endpoints', body);
    },
    onSuccess: onSaved,
  });
  const generate = useMutation({
    mutationFn: () => adminSend<{ sdl: string; resolvers: Record<string, unknown> }>(api, backend, 'POST', '/graphql/generate', {}),
    onSuccess: (generated) => {
      // Written out as text, the generated schema can be edited; its resolvers go with it.
      setForm((current) => ({ ...current, gqlSource: 'sdl', sdl: generated.sdl, resolvers: JSON.stringify(generated.resolvers, null, 2) }));
    },
  });
  const makeFile = useMutation({
    mutationFn: () => api.createHandler(backend, form.file.replace(/^handlers\//, '')),
    onSuccess: (file) => {
      setCreated(file);
    },
  });

  const submit = () => {
    setShown(true);
    if (problems.length === 0) save.mutate();
  };
  const field = (key: string, label: string, control: React.ReactNode, hint?: string) => (
    <label>
      <span>
        {label} {hint === undefined ? null : <Hint text={hint} />}
      </span>
      {control}
      {problem(key) === undefined ? null : <span className="error">{problem(key)}</span>}
    </label>
  );

  return (
    <Modal title={editing ? 'Edit endpoint' : copy ? 'Duplicate endpoint' : 'Add endpoint'} onClose={onClose} wide>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {field(
          'type',
          'What should it do?',
          <select
            value={form.type}
            onChange={(event) => {
              setForm(changeType(form, event.target.value as EndpointType, collections));
            }}
          >
            {ENDPOINT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>,
          ENDPOINT_TYPES.find((type) => type.value === form.type)?.hint,
        )}

        {form.type === 'crud' ? (
          <>
            <div className="row">
              {field(
                'collection',
                'Collection',
                <select
                  value={form.collection}
                  onChange={(event) => {
                    setForm(suggest({ ...form, collection: event.target.value, searchFields: [], ownerField: '' }, true));
                  }}
                >
                  {collections.length === 0 ? <option value="">(none yet)</option> : null}
                  {collections.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>,
                'A collection is a table of records, such as products. Add one in the Data tab.',
              )}
              {field(
                'crudAction',
                'Action',
                <select
                  value={form.crudAction}
                  onChange={(event) => {
                    setForm(suggest({ ...form, crudAction: event.target.value as EndpointForm['crudAction'] }, true));
                  }}
                >
                  {CRUD_ACTIONS.map((action) => (
                    <option key={action.value} value={action.value}>
                      {action.label}
                    </option>
                  ))}
                </select>,
              )}
            </div>
            {form.crudAction === 'list' ? (
              <>
                {field(
                  'listShape',
                  'List answer shape',
                  <select
                    value={form.listShape}
                    onChange={(event) => {
                      set('listShape', event.target.value as EndpointForm['listShape']);
                    }}
                  >
                    <option value="dummyjson">{`{ ${form.collection || 'records'}: [...], total, skip, limit }`}</option>
                    <option value="paged">{'{ items: [...], total, page, pageSize }'}</option>
                  </select>,
                )}
                <fieldset className="plain-fieldset">
                  <legend>Search looks in</legend>
                  {searchable.length === 0 ? <span className="muted">This collection has no text fields.</span> : null}
                  {searchable.map((item) => (
                    <label key={item.name} className="check">
                      <input
                        type="checkbox"
                        checked={form.searchFields.includes(item.name)}
                        onChange={(event) => {
                          set('searchFields', event.target.checked ? [...form.searchFields, item.name] : form.searchFields.filter((name) => name !== item.name));
                        }}
                      />
                      {item.name}
                    </label>
                  ))}
                  <span className="muted">Leave all unticked to search every text field.</span>
                </fieldset>
              </>
            ) : null}
            {field(
              'ownerField',
              'Owner field (optional)',
              <select
                value={form.ownerField}
                onChange={(event) => {
                  setForm({ ...form, ownerField: event.target.value, auth: event.target.value === '' ? form.auth : 'bearer' });
                }}
              >
                <option value="">Everyone sees every record</option>
                {owners.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>,
              'A number field that holds the id of the signed-in user. Each user then sees only their own records. Needs sign-in.',
            )}
          </>
        ) : null}

        {form.type === 'static' ? (
          <>
            {field(
              'status',
              'Status',
              <input
                className="short"
                inputMode="numeric"
                value={form.status}
                aria-invalid={problem('status') !== undefined}
                onChange={(event) => {
                  set('status', event.target.value);
                }}
              />,
            )}
            <div className="stack tight">
              <div className="row">
                <span className="grow">JSON body {problem('body') === undefined ? null : <span className="error">{problem('body')}</span>}</span>
                {Object.keys(templates).length === 0 ? null : (
                  <label>
                    Use template
                    <select
                      value=""
                      onChange={(event) => {
                        if (event.target.value !== '') set('body', JSON.stringify({ template: event.target.value, with: {} }, null, 2));
                      }}
                    >
                      <option value="">Pick a template…</option>
                      {Object.keys(templates).map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <DynamicValuesHelp />
              </div>
              <ResponseEditor
                label="JSON body"
                value={form.body}
                onChange={(body) => {
                  set('body', body);
                }}
                schema={documentedSchema(endpoint, form.status)}
                {...(endpoint === undefined || copy ? {} : { saved: savedBody })}
                invalid={problem('body') !== undefined}
              />
            </div>
          </>
        ) : null}

        {form.type === 'auth' || form.type === 'users'
          ? field(
              'action',
              'Step',
              <select
                value={form.action}
                onChange={(event) => {
                  setForm(suggest({ ...form, action: event.target.value }, true));
                }}
              >
                {(form.type === 'auth' ? AUTH_ACTIONS : USER_ACTIONS).map((action) => (
                  <option key={action.value} value={action.value}>
                    {action.label}
                  </option>
                ))}
              </select>,
              'This works on the built-in app users. See the Users tab.',
            )
          : null}

        {form.type === 'upload' ? (
          <div className="row">
            {field(
              'maxMb',
              'Largest file (MB, optional)',
              <input
                className="short"
                inputMode="decimal"
                value={form.maxMb}
                aria-invalid={problem('maxMb') !== undefined}
                onChange={(event) => {
                  set('maxMb', event.target.value);
                }}
              />,
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={form.multiple}
                onChange={(event) => {
                  set('multiple', event.target.checked);
                }}
              />
              Accept several files at once
            </label>
          </div>
        ) : null}

        {form.type === 'download' ? <p className="muted">The path needs an :id part, for example /media/:id. It sends back the stored file with that id.</p> : null}

        {form.type === 'handler' ? (
          <>
            <div className="row">
              {field(
                'file',
                'File name',
                <input
                  value={form.file}
                  aria-invalid={problem('file') !== undefined}
                  onChange={(event) => {
                    set('file', event.target.value);
                    setCreated(null);
                  }}
                />,
              )}
              {field(
                'timeoutMs',
                'Time limit (ms)',
                <input
                  className="short"
                  inputMode="numeric"
                  value={form.timeoutMs}
                  aria-invalid={problem('timeoutMs') !== undefined}
                  onChange={(event) => {
                    set('timeoutMs', event.target.value);
                  }}
                />,
              )}
            </div>
            <div className="row">
              <button
                type="button"
                disabled={problems.some((item) => item.field === 'file') || makeFile.isPending}
                onClick={() => {
                  makeFile.mutate();
                }}
              >
                Create file from example
              </button>
              {created === null ? null : <span className="ok">Created {created}. Open it in your editor to change what it does.</span>}
            </div>
            <ErrorNote error={makeFile.error === null ? null : errorMessage(makeFile.error)} />
            <p className="warning">A handler is code that runs on this Mac with your permissions. It is not a sandbox: only use backends you trust.</p>
          </>
        ) : null}

        {form.type === 'graphql' ? (
          <>
            {field(
              'gqlSource',
              'Schema',
              <select
                value={form.gqlSource}
                onChange={(event) => {
                  set('gqlSource', event.target.value as EndpointForm['gqlSource']);
                }}
              >
                <option value="collections">Built from my collections</option>
                <option value="sdl">Written by me (SDL)</option>
              </select>,
              'From collections: each collection gets a type, queries (products, productsById), mutations (createProduct...) and subscriptions (productsCreated...). With your own SDL, every field is answered by a resolver you name below, or is null.',
            )}
            <div className="stack tight">
              <div className="row">
                <label className="grow" htmlFor={`${ids}-sdl`}>
                  {form.gqlSource === 'sdl' ? 'Schema (SDL)' : 'Extra schema (optional, SDL)'}{' '}
                  {problem('sdl') === undefined ? null : <span className="error">{problem('sdl')}</span>}
                </label>
                <button
                  type="button"
                  disabled={generate.isPending}
                  onClick={() => {
                    generate.mutate();
                  }}
                >
                  Generate from collections
                </button>
              </div>
              <textarea
                id={`${ids}-sdl`}
                className="code-area"
                rows={form.gqlSource === 'sdl' ? 12 : 4}
                spellCheck={false}
                aria-label="GraphQL schema"
                placeholder={form.gqlSource === 'sdl' ? 'type Query { hello(name: String): String }' : 'extend type Query { hello: String }'}
                value={form.sdl}
                aria-invalid={problem('sdl') !== undefined}
                onChange={(event) => {
                  set('sdl', event.target.value);
                }}
              />
              <ErrorNote error={generate.error === null ? null : errorMessage(generate.error)} />
            </div>
            <div className="stack tight">
              <span>
                Resolvers {problem('resolvers') === undefined ? null : <span className="error">{problem('resolvers')}</span>}{' '}
                <Hint text='What answers a field: { "Query.hello": { "static": "Hello {{args.name}}" } }, { "Query.items": { "collection": "products", "action": "list" } }, { "Query.x": { "handler": "handlers/x.js" } } or, for a subscription, { "Subscription.shipped": { "event": "orders.shipped" } }.' />
              </span>
              <ResponseEditor
                label="GraphQL resolvers"
                value={form.resolvers}
                onChange={(resolvers) => {
                  set('resolvers', resolvers);
                }}
                invalid={problem('resolvers') !== undefined}
                height={140}
              />
            </div>
            <div className="row">
              {field(
                'maxDepth',
                'Deepest query',
                <input
                  className="short"
                  inputMode="numeric"
                  value={form.maxDepth}
                  aria-invalid={problem('maxDepth') !== undefined}
                  onChange={(event) => {
                    set('maxDepth', event.target.value);
                  }}
                />,
                'A query nested deeper than this is refused. The schema questions that tools ask (introspection) are not counted.',
              )}
              {field(
                'maxFields',
                'Most fields',
                <input
                  className="short"
                  inputMode="numeric"
                  value={form.maxFields}
                  aria-invalid={problem('maxFields') !== undefined}
                  onChange={(event) => {
                    set('maxFields', event.target.value);
                  }}
                />,
                'A query that selects more fields than this is refused. A fragment counts every time it is used.',
              )}
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.introspection}
                  onChange={(event) => {
                    set('introspection', event.target.checked);
                  }}
                />
                Answer introspection
              </label>
            </div>
            {field(
              'requireAuth',
              'Needs sign-in (optional)',
              <textarea
                rows={2}
                value={form.requireAuth}
                placeholder="Mutation.createProduct"
                aria-invalid={problem('requireAuth') !== undefined}
                onChange={(event) => {
                  set('requireAuth', event.target.value);
                }}
              />,
              'These operations need a signed-in user, one per line. To protect every operation, tick Needs sign-in below.',
            )}
          </>
        ) : null}

        {form.type === 'websocket' ? (
          <>
            {field(
              'behavior',
              'What it does with a message',
              <select
                value={form.behavior}
                onChange={(event) => {
                  set('behavior', event.target.value as EndpointForm['behavior']);
                }}
              >
                <option value="echo">Echo: send every message back</option>
                <option value="rules">Rules: answer by what the message says</option>
              </select>,
            )}
            {form.behavior === 'rules' ? (
              <div className="stack tight">
                <div className="row">
                  <span className="grow">
                    Rules {problem('rules') === undefined ? null : <span className="error">{problem('rules')}</span>}{' '}
                    <Hint text='The first rule whose match fits answers. A match uses type, jsonPath, equals, contains, startsWith and endsWith (all that are given must fit). The reply can use {{message.field}}; set broadcast to send it to everyone. Regular expressions are not supported: a crafted one could freeze the server.' />
                  </span>
                  <DynamicValuesHelp />
                </div>
                <ResponseEditor
                  label="WebSocket rules"
                  value={form.rules}
                  onChange={(rules) => {
                    set('rules', rules);
                  }}
                  invalid={problem('rules') !== undefined}
                  height={160}
                />
              </div>
            ) : null}
            <div className="stack tight">
              <span>
                Welcome message (optional) {problem('onConnect') === undefined ? null : <span className="error">{problem('onConnect')}</span>}{' '}
                <Hint text="Sent when an app connects. JSON, or text in quotes. Placeholders such as {{uuid}} and {{now}} are filled." />
              </span>
              <ResponseEditor
                label="Welcome message"
                value={form.onConnect}
                onChange={(onConnect) => {
                  set('onConnect', onConnect);
                }}
                invalid={problem('onConnect') !== undefined}
                height={90}
              />
            </div>
            {field(
              'on',
              'Send these data changes',
              <textarea
                rows={2}
                value={form.on}
                placeholder="products.created, products.updated"
                aria-invalid={problem('on') !== undefined}
                onChange={(event) => {
                  set('on', event.target.value);
                }}
              />,
              'Every connected app gets { "event": ..., "data": ... } when one of these happens. products.* means every change to products.',
            )}
            <div className="row">
              {field(
                'subprotocols',
                'Subprotocols',
                <input
                  value={form.subprotocols}
                  placeholder="chat.v1"
                  onChange={(event) => {
                    set('subprotocols', event.target.value);
                  }}
                />,
                'Names the app may offer in new WebSocket(url, [...]). To sign in, an app sends ["bearer", token] (or ?token=...); the engine answers "bearer", never the token.',
              )}
              {field(
                'maxPayloadKb',
                'Largest message (KB)',
                <input
                  className="short"
                  inputMode="numeric"
                  value={form.maxPayloadKb}
                  aria-invalid={problem('maxPayloadKb') !== undefined}
                  onChange={(event) => {
                    set('maxPayloadKb', event.target.value);
                  }}
                />,
              )}
            </div>
          </>
        ) : null}

        {form.type === 'sse' ? (
          <>
            <div className="stack tight">
              <div className="row">
                <span className="grow">
                  Script {problem('script') === undefined ? null : <span className="error">{problem('script')}</span>}{' '}
                  <Hint text="Messages sent, in order, to every app that connects: { event, data, delayMs, repeat }. Use {{seq}}, {{now}} and {{uuid}} in the data. A repeat sends the message several times, each after its delay." />
                </span>
                <DynamicValuesHelp />
              </div>
              <ResponseEditor
                label="SSE script"
                value={form.script}
                onChange={(script) => {
                  set('script', script);
                }}
                invalid={problem('script') !== undefined}
                height={150}
              />
            </div>
            {field(
              'on',
              'Send these data changes',
              <textarea
                rows={2}
                value={form.on}
                placeholder="products.created, products.updated"
                aria-invalid={problem('on') !== undefined}
                onChange={(event) => {
                  set('on', event.target.value);
                }}
              />,
              'Every app that is connected gets a message when one of these happens. products.* means every change to products; * means everything, including events your custom code sends with ctx.emit.',
            )}
            <div className="row">
              {field(
                'retryMs',
                'Reconnect after (ms)',
                <input
                  className="short"
                  inputMode="numeric"
                  value={form.retryMs}
                  aria-invalid={problem('retryMs') !== undefined}
                  onChange={(event) => {
                    set('retryMs', event.target.value);
                  }}
                />,
                'The hint that tells an app how long to wait before it connects again.',
              )}
              {field(
                'heartbeatMs',
                'Heartbeat (ms)',
                <input
                  className="short"
                  inputMode="numeric"
                  value={form.heartbeatMs}
                  aria-invalid={problem('heartbeatMs') !== undefined}
                  onChange={(event) => {
                    set('heartbeatMs', event.target.value);
                  }}
                />,
                'A small comment sent this often so proxies keep an idle stream open. 0 turns it off.',
              )}
            </div>
          </>
        ) : null}

        <div className="row">
          {field(
            'method',
            'Method',
            <select
              value={form.method}
              onChange={(event) => {
                set('method', event.target.value as EndpointForm['method']);
              }}
            >
              {METHODS.map((method) => (
                <option key={method}>{method}</option>
              ))}
            </select>,
          )}
          <div className="grow">
            {field(
              'path',
              'Path',
              <input
                value={form.path}
                placeholder="/products/:id"
                aria-invalid={problem('path') !== undefined}
                onChange={(event) => {
                  set('path', event.target.value);
                }}
              />,
              'The address after the server name. A part like :id stands for any value.',
            )}
          </div>
        </div>
        <div className="row">
          <label className="check" htmlFor={`${ids}-auth`}>
            <input
              id={`${ids}-auth`}
              type="checkbox"
              checked={form.auth === 'bearer'}
              onChange={(event) => {
                set('auth', event.target.checked ? 'bearer' : 'none');
              }}
            />
            Needs sign-in
          </label>
          <div className="grow">
            {field(
              'summary',
              'Note (optional)',
              <input
                value={form.summary}
                onChange={(event) => {
                  set('summary', event.target.value);
                }}
              />,
            )}
          </div>
        </div>
        <fieldset className="plain-fieldset" aria-label="Answer shape">
          <legend>
            Answer shape <Hint text="How this endpoint's answers are wrapped and which headers they carry. Settings, Responses holds the backend-wide wrapper and the templates." />
          </legend>
          <div className="row">
            {field(
              'wrap',
              'Success wrapper',
              <select
                value={form.wrap}
                onChange={(event) => {
                  set('wrap', event.target.value);
                }}
              >
                <option value="inherit">Same as the backend</option>
                <option value="none">No wrapper</option>
                {Object.entries(templates).map(([name]) => (
                  <option key={name} value={name}>
                    Template: {name}
                  </option>
                ))}
                {form.wrap !== 'inherit' && form.wrap !== 'none' && templates[form.wrap] === undefined ? <option value={form.wrap}>{form.wrap} (missing)</option> : null}
              </select>,
              'The backend\'s wrapper puts the answer inside something like { success, data, message }. Choose No wrapper to send this endpoint\'s answer as it is.',
            )}
          </div>
          <HeadersEditor label="Headers" rows={form.headers} onChange={(rows) => { set('headers', rows); }} />
        </fieldset>
        <fieldset className="plain-fieldset" aria-label="Speed">
          <legend>
            Speed <Hint text="Delay and network for this endpoint only. A scenario's own delay wins over these." />
          </legend>
          <LatencyFields form={form.latency} onChange={(next) => { set('latency', next); }} inheritLabel="Same as the backend" />
          {problem('latency') === undefined ? null : <span className="error">{problem('latency')}</span>}
          <NetworkFields form={form.network} onChange={(next) => { set('network', next); }} inheritLabel="Same as the backend" />
          {problem('network') === undefined ? null : <span className="error">{problem('network')}</span>}
        </fieldset>
        <fieldset className="plain-fieldset" aria-label="Faults">
          <legend>
            Faults <Hint text="Trouble on purpose, for this endpoint only. Each setting you fill in replaces the backend's. In test mode faults are off unless a request sends x-tempo-test-faults: 1." />
          </legend>
          <FaultsFields form={form.faults} onChange={(next) => { set('faults', next); }} />
          {problem('faults') === undefined ? null : <span className="error">{problem('faults')}</span>}
        </fieldset>
        <fieldset className="plain-fieldset" aria-label="Scenarios">
          <legend>
            Scenarios <Hint text="Canned answers you can switch to from the endpoint list or with the x-tempo-scenario header: errors, empty lists, slow answers." />
          </legend>
          {form.scenarios.length === 0 ? <span className="muted">None yet. Built-in ones (notFound, unauthorized, serverError, rateLimited...) are always there.</span> : null}
          {form.scenarios.map((scenario, index) => {
            const patch = (change: Partial<typeof scenario>): void => {
              set('scenarios', form.scenarios.map((item, at) => (at === index ? { ...item, ...change } : item)));
            };
            const at = (key: string): string | undefined => problem(`scenarios.${String(index)}.${key}`);
            return (
              <div key={index} className="card stack tight" role="group" aria-label={`Scenario ${scenario.name || String(index + 1)}`}>
                <div className="row">
                  <label className="grow">
                    Name
                    <input
                      aria-label={`Scenario ${String(index + 1)} name`}
                      value={scenario.name}
                      aria-invalid={at('name') !== undefined}
                      onChange={(event) => {
                        patch({ name: event.target.value });
                      }}
                    />
                  </label>
                  <label>
                    Status
                    <input
                      className="short"
                      aria-label={`Scenario ${String(index + 1)} status`}
                      inputMode="numeric"
                      placeholder="200"
                      value={scenario.status}
                      onChange={(event) => {
                        patch({ status: event.target.value });
                      }}
                    />
                  </label>
                  <label>
                    Delay (ms)
                    <input
                      className="short"
                      aria-label={`Scenario ${String(index + 1)} delay`}
                      inputMode="numeric"
                      value={scenario.delayMs}
                      onChange={(event) => {
                        patch({ delayMs: event.target.value });
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="ghost bad"
                    aria-label={`Remove scenario ${scenario.name || String(index + 1)}`}
                    onClick={() => {
                      set('scenarios', form.scenarios.filter((_item, position) => position !== index));
                    }}
                  >
                    Remove
                  </button>
                </div>
                {['name', 'status', 'delayMs', 'body'].map((key) => (at(key) === undefined ? null : <span key={key} className="error">{at(key)}</span>))}
                <ResponseEditor
                  label={`Scenario ${String(index + 1)} body`}
                  value={scenario.body}
                  onChange={(body) => {
                    patch({ body });
                  }}
                  schema={scenario.original?.schema}
                  saved={scenario.savedBody}
                  height={130}
                />
              </div>
            );
          })}
          <div>
            <button
              type="button"
              onClick={() => {
                set('scenarios', [...form.scenarios, blankScenario('')]);
              }}
            >
              Add scenario
            </button>
          </div>
        </fieldset>
        <ErrorNote error={save.error === null ? null : errorMessage(save.error)} />
        <div className="row end">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={save.isPending}>
            {editing ? 'Save endpoint' : 'Add endpoint'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
