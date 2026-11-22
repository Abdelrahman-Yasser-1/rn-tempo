import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { adminSend } from '../api/client';
import { useApi } from '../api/context';
import type { CollectionDef, EndpointDef, EndpointType } from '../api/types';
import {
  AUTH_ACTIONS,
  blankForm,
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

interface Props {
  backend: string;
  collections: CollectionDef[];
  existingIds: ReadonlySet<string>;
  /** The endpoint being edited, or the one being copied (then `copy` is set). */
  endpoint?: EndpointDef;
  copy?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** One form for every endpoint type: the fields below the type change with it. */
export function EndpointDialog({ backend, collections, existingIds, endpoint, copy = false, onClose, onSaved }: Props) {
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
            {field(
              'body',
              'JSON body',
              <textarea
                className="code-area"
                rows={8}
                spellCheck={false}
                value={form.body}
                aria-invalid={problem('body') !== undefined}
                onChange={(event) => {
                  set('body', event.target.value);
                }}
              />,
            )}
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
