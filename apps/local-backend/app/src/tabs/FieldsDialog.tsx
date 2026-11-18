import { useState } from 'react';

import { adminSend } from '../api/client';
import { useApi } from '../api/context';
import { FIELD_TYPES, type CollectionDef, type FieldDef, type FieldType } from '../api/types';
import { useLossFlow } from '../hooks/useLossFlow';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { LossDialog } from '../ui/LossDialog';
import { Modal } from '../ui/Modal';
import { ErrorNote } from '../ui/bits';

const TYPE_WORDS: Record<FieldType, string> = {
  string: 'Text',
  number: 'Number',
  boolean: 'Yes or no',
  date: 'Date',
  enum: 'One of a list',
  json: 'JSON',
  relation: 'Link to another collection',
  media: 'Media file',
};

interface FieldDraft {
  name: string;
  type: FieldType;
  required: boolean;
  unique: boolean;
  enumValues: string;
  relationTo: string;
}

const draftOf = (field?: FieldDef): FieldDraft => ({
  name: field?.name ?? '',
  type: field?.type ?? 'string',
  required: field?.required ?? false,
  unique: field?.unique ?? false,
  enumValues: (field?.enumValues ?? []).join(', '),
  relationTo: field?.relationTo ?? '',
});

function fieldFrom(draft: FieldDraft, original?: FieldDef): FieldDef {
  return {
    ...(original?.default === undefined ? {} : { default: original.default }),
    name: draft.name.trim(),
    type: draft.type,
    ...(draft.required ? { required: true } : {}),
    ...(draft.unique ? { unique: true } : {}),
    ...(draft.type === 'enum' ? { enumValues: draft.enumValues.split(',').map((item) => item.trim()).filter(Boolean) } : {}),
    ...(draft.type === 'relation' ? { relationTo: draft.relationTo } : {}),
  };
}

function FieldForm({ draft, others, onChange, locked }: { draft: FieldDraft; others: string[]; onChange: (draft: FieldDraft) => void; locked?: boolean }) {
  return (
    <div className="stack">
      <div className="row">
        <label className="grow">
          Name
          <input
            value={draft.name}
            disabled={locked}
            onChange={(event) => {
              onChange({ ...draft, name: event.target.value });
            }}
          />
        </label>
        <label>
          Type
          <select
            value={draft.type}
            onChange={(event) => {
              onChange({ ...draft, type: event.target.value as FieldType });
            }}
          >
            {FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_WORDS[type]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {draft.type === 'enum' ? (
        <label>
          Allowed values (separated by commas)
          <input
            value={draft.enumValues}
            onChange={(event) => {
              onChange({ ...draft, enumValues: event.target.value });
            }}
          />
        </label>
      ) : null}
      {draft.type === 'relation' ? (
        <label>
          Links to
          <select
            value={draft.relationTo}
            onChange={(event) => {
              onChange({ ...draft, relationTo: event.target.value });
            }}
          >
            <option value="">(choose)</option>
            {others.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="row">
        <label className="check">
          <input
            type="checkbox"
            checked={draft.required}
            onChange={(event) => {
              onChange({ ...draft, required: event.target.checked });
            }}
          />
          Required
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.unique}
            onChange={(event) => {
              onChange({ ...draft, unique: event.target.checked });
            }}
          />
          Every value different
        </label>
      </div>
    </div>
  );
}

type Mode = { kind: 'add' } | { kind: 'edit'; field: FieldDef } | { kind: 'rename'; field: FieldDef } | { kind: 'remove'; field: FieldDef };

/** Add, change, rename and remove the fields of a collection. A change that loses data asks twice. */
export function FieldsDialog({ backend, collection, allCollections, onClose, onChanged }: { backend: string; collection: CollectionDef; allCollections: string[]; onClose: () => void; onChanged: () => void }) {
  const api = useApi();
  const [mode, setMode] = useState<Mode | null>(null);
  const [draft, setDraft] = useState<FieldDraft>(draftOf());
  const [newName, setNewName] = useState('');
  const base = `/collections/${collection.name}/fields`;
  const query = (confirm: boolean) => (confirm ? '?confirm=true' : '');

  const flow = useLossFlow(
    async (confirm) => {
      if (mode === null) return;
      if (mode.kind === 'add') await adminSend(api, backend, 'POST', `${base}${query(confirm)}`, fieldFrom(draft));
      else if (mode.kind === 'edit') await adminSend(api, backend, 'PUT', `${base}/${mode.field.name}${query(confirm)}`, fieldFrom(draft, mode.field));
      else if (mode.kind === 'rename') await adminSend(api, backend, 'POST', `${base}/${mode.field.name}/rename${query(confirm)}`, { to: newName.trim() });
      else await adminSend(api, backend, 'DELETE', `${base}/${mode.field.name}${query(confirm)}`);
    },
    () => {
      setMode(null);
      onChanged();
    },
  );
  const others = allCollections.filter((name) => name !== collection.name);
  const open = (next: Mode) => {
    setMode(next);
    if (next.kind === 'add') setDraft(draftOf());
    if (next.kind === 'edit') setDraft(draftOf(next.field));
    if (next.kind === 'rename') setNewName(next.field.name);
  };

  return (
    <Modal title={`Fields of ${collection.name}`} onClose={onClose} wide>
      <p className="muted">Every record also has an id. Changing a field updates the table; anything that would delete data asks you first.</p>
      {collection.fields.length === 0 ? (
        <p className="empty">No fields yet. Choose Add field to make the first one.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Rules</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {collection.fields.map((field) => (
              <tr key={field.name}>
                <td>{field.name}</td>
                <td>{TYPE_WORDS[field.type]}</td>
                <td>{[field.required ? 'required' : '', field.unique ? 'unique' : ''].filter(Boolean).join(', ')}</td>
                <td className="actions-cell">
                  <button type="button" className="ghost" aria-label={`Change ${field.name}`} onClick={() => { open({ kind: 'edit', field }); }}>
                    Change
                  </button>
                  <button type="button" className="ghost" aria-label={`Rename ${field.name}`} onClick={() => { open({ kind: 'rename', field }); }}>
                    Rename
                  </button>
                  <button type="button" className="ghost bad" aria-label={`Remove ${field.name}`} onClick={() => { open({ kind: 'remove', field }); }}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row end">
        <button type="button" onClick={() => { open({ kind: 'add' }); }}>
          Add field
        </button>
        <button type="button" className="primary" onClick={onClose}>
          Done
        </button>
      </div>

      {mode === null || mode.kind === 'remove' ? null : (
        <Modal
          title={mode.kind === 'add' ? 'Add a field' : mode.kind === 'edit' ? `Change ${mode.field.name}` : `Rename ${mode.field.name}`}
          onClose={() => {
            setMode(null);
            flow.cancel();
          }}
        >
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              void flow.start();
            }}
          >
            {mode.kind === 'rename' ? (
              <label>
                New name
                <input
                  value={newName}
                  onChange={(event) => {
                    setNewName(event.target.value);
                  }}
                />
              </label>
            ) : (
              <FieldForm draft={draft} others={others} onChange={setDraft} locked={mode.kind === 'edit'} />
            )}
            <ErrorNote error={flow.error} />
            <div className="row end">
              <button type="button" onClick={() => { setMode(null); }}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={flow.busy}>
                {mode.kind === 'add' ? 'Add field' : mode.kind === 'edit' ? 'Save change' : 'Rename'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {mode?.kind === 'remove' && flow.lost === null ? (
        <ConfirmDialog
          title={`Remove ${mode.field.name}?`}
          confirmLabel="Remove field"
          busy={flow.busy}
          onCancel={() => {
            setMode(null);
          }}
          onConfirm={() => {
            void flow.start();
          }}
        >
          <p>
            The field <strong>{mode.field.name}</strong> disappears from {collection.name}. If records have a value in it, you will see how many before anything is deleted.
          </p>
          <ErrorNote error={flow.error} />
        </ConfirmDialog>
      ) : null}
      {flow.lost === null ? null : <LossDialog message={flow.lost.message} items={flow.lost.items} busy={flow.busy} onConfirm={() => void flow.confirm()} onCancel={flow.cancel} />}
    </Modal>
  );
}
