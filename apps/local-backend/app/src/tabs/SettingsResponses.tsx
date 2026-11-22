import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { adminSend } from '../api/client';
import { useApi } from '../api/context';
import type { BackendStatus, Definition, ResponsesDef, ResponseTemplateDef } from '../api/types';
import { useRefresh } from '../hooks/lb';
import { errorMessage } from '../lib/errors';
import { readText, writeText } from '../lib/jsonForm';
import { DEFAULT_ERROR_TEMPLATE, DEFAULT_WRAPPER, hasBodySlot, TEMPLATE_NAME } from '../lib/placeholders';
import { ErrorNote, Hint } from '../ui/bits';
import { headersFromRows, HeadersEditor, rowsFromHeaders, type HeaderRows } from '../ui/HeadersEditor';
import { ResponseEditor } from '../ui/ResponseEditor';

interface TemplateForm {
  name: string;
  status: string;
  headers: HeaderRows;
  body: string;
  /** The saved text, for "Show changes". */
  saved: string;
}

const templateFormOf = (name: string, template: ResponseTemplateDef): TemplateForm => {
  const body = writeText(template.body);
  return { name, status: template.status === undefined ? '' : String(template.status), headers: rowsFromHeaders(template.headers), body, saved: body };
};

type ErrorFormat = NonNullable<NonNullable<ResponsesDef['error']>['format']>;

/** The shared shape of the answers: the success wrapper, the error format, the common headers and the response templates. */
export function SettingsResponses({ backend, definition }: { backend: BackendStatus; definition: Definition }) {
  const api = useApi();
  const refresh = useRefresh(backend.path);
  const responses = definition.responses;
  const [wrapOn, setWrapOn] = useState(responses?.success !== undefined);
  const [wrapper, setWrapper] = useState(responses?.success === undefined ? DEFAULT_WRAPPER : writeText(responses.success));
  const savedWrapper = responses?.success === undefined ? undefined : writeText(responses.success);
  const [format, setFormat] = useState<ErrorFormat>(responses?.error?.format ?? 'problem');
  const [errorTemplate, setErrorTemplate] = useState(responses?.error?.template === undefined ? DEFAULT_ERROR_TEMPLATE : writeText(responses.error.template));
  const [headers, setHeaders] = useState<HeaderRows>(() => rowsFromHeaders(responses?.headers));
  const [templates, setTemplates] = useState<TemplateForm[]>(() => Object.entries(definition.responseTemplates ?? {}).map(([name, template]) => templateFormOf(name, template)));
  const [newName, setNewName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const patch = (index: number, change: Partial<TemplateForm>): void => {
    setTemplates((list) => list.map((item, at) => (at === index ? { ...item, ...change } : item)));
  };
  const add = (): void => {
    const name = newName.trim();
    if (!TEMPLATE_NAME.test(name)) {
      setProblem('A template name starts with a letter and holds letters, digits, "-" and "_".');
      return;
    }
    if (templates.some((item) => item.name === name)) {
      setProblem(`There is already a template named "${name}".`);
      return;
    }
    setProblem(null);
    setTemplates([...templates, { name, status: '', headers: [], body: '{\n  "message": "{{with.message}}"\n}', saved: '' }]);
    setNewName('');
  };

  const save = useMutation({
    mutationFn: async () => {
      const next: ResponsesDef = {};
      if (wrapOn) {
        const read = readText(wrapper);
        if (!read.ok) return fail(`The success wrapper is not valid JSON: ${read.message}`);
        if (!hasBodySlot(read.value)) return fail('The success wrapper needs "{{body}}" (the whole string) where the endpoint\'s body goes.');
        next.success = read.value;
      }
      if (format !== 'problem') {
        next.error = { format };
        if (format === 'custom') {
          const read = readText(errorTemplate);
          if (!read.ok || read.value === undefined) return fail(`The error template is not valid JSON${read.ok ? '' : `: ${read.message}`}.`);
          next.error.template = read.value;
        }
      }
      const common = headersFromRows(headers);
      if (common !== undefined) next.headers = common;
      const made: Record<string, ResponseTemplateDef> = {};
      for (const item of templates) {
        const body = readText(item.body);
        if (!body.ok) return fail(`The template "${item.name}" is not valid JSON: ${body.message}`);
        const status = item.status.trim() === '' ? undefined : Number(item.status);
        if (status !== undefined && !(Number.isInteger(status) && status >= 100 && status <= 599)) return fail(`The status of "${item.name}" is a number from 100 to 599.`);
        const itemHeaders = headersFromRows(item.headers);
        made[item.name] = { ...(status === undefined ? {} : { status }), ...(itemHeaders === undefined ? {} : { headers: itemHeaders }), ...(body.value === undefined ? {} : { body: body.value }) };
      }
      setProblem(null);
      await adminSend(api, backend.path, 'PUT', '/settings/responses', {
        ...(Object.keys(next).length === 0 ? {} : { responses: next }),
        ...(Object.keys(made).length === 0 ? {} : { responseTemplates: made }),
      });
      setTemplates((list) => list.map((item) => ({ ...item, saved: item.body })));
      return true;
    },
    onSuccess: async (saved) => {
      if (saved) await refresh();
    },
  });
  function fail(message: string): false {
    setProblem(message);
    return false;
  }

  return (
    <section className="card" aria-label="Responses">
      <h2>Responses</h2>
      <p className="muted">One shape for every answer, so each endpoint does not repeat it. An endpoint can opt out or use a template of its own in its form.</p>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <label className="check">
          <input
            type="checkbox"
            checked={wrapOn}
            onChange={(event) => {
              setWrapOn(event.target.checked);
            }}
          />
          Wrap every success answer <Hint text='The string "{{body}}" (the whole string) is replaced by the endpoint&apos;s body, so {"data": "{{body}}"} keeps arrays and objects as they are. Errors are not wrapped.' />
        </label>
        {wrapOn ? <ResponseEditor label="Success wrapper" value={wrapper} onChange={setWrapper} saved={savedWrapper} height={150} /> : null}

        <label>
          Error format
          <select
            value={format}
            onChange={(event) => {
              setFormat(event.target.value as ErrorFormat);
            }}
          >
            <option value="problem">Problem details (application/problem+json)</option>
            <option value="dummyjson">dummyjson style: { '{ "message": "..." }' }</option>
            <option value="custom">Custom template</option>
          </select>
        </label>
        {format === 'custom' ? (
          <>
            <ResponseEditor label="Error template" value={errorTemplate} onChange={setErrorTemplate} height={150} />
            <p className="muted">
              <code>{'{{status}}'}</code>, <code>{'{{message}}'}</code> and <code>{'{{errors}}'}</code> are filled in. This is the shape of errors the engine makes: validation (400), sign-in (401), not found (404), wrong method (405), rate limits (429).
            </p>
          </>
        ) : null}

        <HeadersEditor label="Common headers" rows={headers} onChange={setHeaders} />

        <h3>Response templates</h3>
        <p className="muted">
          A template is a response you reuse: use it as an endpoint or scenario body with <code>{'{ "template": "name", "with": { "message": "Gone" } }'}</code>, and <code>{'{{with.message}}'}</code> is filled in.
        </p>
        {templates.length === 0 ? <p className="muted">No templates yet.</p> : null}
        {templates.map((item, index) => (
          <div key={item.name} className="template-card card" role="group" aria-label={`Template ${item.name}`}>
            <div className="row">
              <strong className="grow">{item.name}</strong>
              <label>
                Status
                <input
                  className="short"
                  inputMode="numeric"
                  aria-label={`Status of ${item.name}`}
                  value={item.status}
                  onChange={(event) => {
                    patch(index, { status: event.target.value });
                  }}
                />
              </label>
              <button
                type="button"
                className="ghost bad"
                aria-label={`Delete template ${item.name}`}
                onClick={() => {
                  setTemplates((list) => list.filter((_item, at) => at !== index));
                }}
              >
                Delete
              </button>
            </div>
            <ResponseEditor label={`Body of ${item.name}`} value={item.body} onChange={(body) => { patch(index, { body }); }} saved={item.saved === '' ? undefined : item.saved} height={140} />
            <HeadersEditor label={`Headers of ${item.name}`} rows={item.headers} onChange={(rows) => { patch(index, { headers: rows }); }} />
          </div>
        ))}
        <div className="row">
          <input
            aria-label="New template name"
            placeholder="notFound"
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value);
            }}
          />
          <button type="button" onClick={add}>
            Add template
          </button>
        </div>

        <ErrorNote error={problem ?? (save.error === null ? null : errorMessage(save.error))} />
        <div className="row">
          <button type="submit" className="primary" disabled={save.isPending}>
            Save response settings
          </button>
          {save.isSuccess && save.data ? (
            <span className="ok" role="status">
              Saved. It applies to the next request.
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
