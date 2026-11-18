import { useState } from 'react';

import { adminSend } from '../api/client';
import { useApi } from '../api/context';
import { CONTENT_FIELD_TYPES, type ContentFieldDef, type ContentFieldType, type ContentTypeDef } from '../api/types';
import { useLossFlow } from '../hooks/useLossFlow';
import { TYPE_WORDS } from '../lib/content';
import { LossDialog } from '../ui/LossDialog';
import { Modal } from '../ui/Modal';
import { ErrorNote, Hint } from '../ui/bits';

interface FieldRow {
  key: number;
  name: string;
  type: ContentFieldType;
  required: boolean;
  enumValues: string;
  /** The saved field, kept so settings this form does not show (label, default) are not lost. */
  original?: ContentFieldDef;
}

const rowOf = (key: number, field?: ContentFieldDef): FieldRow => ({
  key,
  name: field?.name ?? '',
  type: field?.type ?? 'string',
  required: field?.required ?? false,
  enumValues: (field?.enumValues ?? []).join(', '),
  ...(field === undefined ? {} : { original: field }),
});

function fieldOf(row: FieldRow): ContentFieldDef {
  return {
    ...(row.original?.label === undefined ? {} : { label: row.original.label }),
    ...(row.original?.default === undefined ? {} : { default: row.original.default }),
    name: row.name.trim(),
    type: row.type,
    ...(row.required ? { required: true } : {}),
    ...(row.type === 'enum' ? { enumValues: row.enumValues.split(',').map((item) => item.trim()).filter(Boolean) } : {}),
  };
}

/** Add a content type, or change one: its name in the app, its languages, and its fields. */
export function ContentTypeDialog({ backend, type, onClose, onSaved }: { backend: string; type?: ContentTypeDef; onClose: () => void; onSaved: (name: string) => void }) {
  const api = useApi();
  const editing = type !== undefined;
  const [name, setName] = useState(type?.name ?? '');
  const [label, setLabel] = useState(type?.label ?? '');
  const [localized, setLocalized] = useState(type?.localized ?? true);
  const [singleton, setSingleton] = useState(type?.singleton ?? false);
  const [rows, setRows] = useState<FieldRow[]>(() => (type?.fields ?? []).map((field, index) => rowOf(index, field)));
  const [next, setNext] = useState(rows.length);
  const [problem, setProblem] = useState<string | null>(null);

  const flow = useLossFlow(
    async (confirm) => {
      const body = {
        name: name.trim(),
        ...(label.trim() === '' ? {} : { label: label.trim() }),
        localized,
        ...(singleton ? { singleton: true } : {}),
        fields: rows.map(fieldOf),
      };
      const suffix = confirm ? '?confirm=true' : '';
      if (editing) await adminSend(api, backend, 'PUT', `/content/types/${type.name}${suffix}`, body);
      else await adminSend(api, backend, 'POST', `/content/types${suffix}`, body);
    },
    () => {
      onSaved(name.trim());
    },
  );

  const change = (key: number, patch: Partial<FieldRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };
  const save = () => {
    if (name.trim() === '') {
      setProblem('Give the type a name.');
      return;
    }
    if (rows.some((row) => row.name.trim() === '')) {
      setProblem('Every field needs a name.');
      return;
    }
    setProblem(null);
    void flow.start();
  };

  return (
    <Modal title={editing ? `Edit ${type.label ?? type.name}` : 'Add a content type'} onClose={onClose} wide>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className="row">
          <label className="grow">
            Name
            <input
              value={name}
              disabled={editing}
              placeholder="announcement"
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </label>
          <label className="grow">
            Label (shown in this app)
            <input
              value={label}
              placeholder="Announcement"
              onChange={(event) => {
                setLabel(event.target.value);
              }}
            />
          </label>
        </div>
        {editing ? null : <p className="muted">The name starts with a lowercase letter, then letters, digits or _. It becomes the address, for example /content/announcement.</p>}
        <div className="row">
          <label className="check">
            <input
              type="checkbox"
              checked={localized}
              onChange={(event) => {
                setLocalized(event.target.checked);
              }}
            />
            Translated into every language <Hint text="Each entry holds one set of texts per language. A field left empty in one language shows the default language's text." />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={singleton}
              onChange={(event) => {
                setSingleton(event.target.checked);
              }}
            />
            Only one entry <Hint text="For a single page, such as Home or About." />
          </label>
        </div>
        <h3>Fields</h3>
        {rows.length === 0 ? <p className="empty">No fields yet. Choose Add field.</p> : null}
        {rows.map((row) => (
          <div key={row.key} className="row options" role="group" aria-label={`Field ${row.name === '' ? 'new' : row.name}`}>
            <label className="grow">
              Field name
              <input
                value={row.name}
                disabled={row.original !== undefined}
                onChange={(event) => {
                  change(row.key, { name: event.target.value });
                }}
              />
            </label>
            <label>
              Type
              <select
                value={row.type}
                onChange={(event) => {
                  change(row.key, { type: event.target.value as ContentFieldType });
                }}
              >
                {CONTENT_FIELD_TYPES.map((kind) => (
                  <option key={kind} value={kind}>
                    {TYPE_WORDS[kind]}
                  </option>
                ))}
              </select>
            </label>
            {row.type === 'enum' ? (
              <label className="grow">
                Allowed values (commas)
                <input
                  value={row.enumValues}
                  onChange={(event) => {
                    change(row.key, { enumValues: event.target.value });
                  }}
                />
              </label>
            ) : null}
            <label className="check">
              <input
                type="checkbox"
                checked={row.required}
                onChange={(event) => {
                  change(row.key, { required: event.target.checked });
                }}
              />
              Needed to publish
            </label>
            <button
              type="button"
              className="ghost bad"
              aria-label={`Remove field ${row.name === '' ? 'new' : row.name}`}
              onClick={() => {
                setRows((current) => current.filter((item) => item.key !== row.key));
              }}
            >
              Remove
            </button>
          </div>
        ))}
        <div className="row">
          <button
            type="button"
            onClick={() => {
              setRows((current) => [...current, rowOf(next)]);
              setNext(next + 1);
            }}
          >
            Add field
          </button>
          {editing ? <span className="muted">Removing a field deletes its saved values. You are asked before that happens.</span> : null}
        </div>
        <ErrorNote error={problem ?? flow.error} />
        <div className="row end">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={flow.busy}>
            {editing ? 'Save type' : 'Add type'}
          </button>
        </div>
      </form>
      {flow.lost === null ? null : <LossDialog message={flow.lost.message} items={flow.lost.items} busy={flow.busy} onConfirm={() => void flow.confirm()} onCancel={flow.cancel} />}
    </Modal>
  );
}
