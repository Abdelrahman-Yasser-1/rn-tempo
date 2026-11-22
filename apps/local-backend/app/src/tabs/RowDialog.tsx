import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { adminSend } from '../api/client';
import { useApi } from '../api/context';
import type { CollectionDef } from '../api/types';
import { blankRow, formToRow, rowToForm, type RowForm } from '../lib/rows';
import { errorMessage } from '../lib/errors';
import { Modal } from '../ui/Modal';
import { ErrorNote } from '../ui/bits';
import { ResponseEditor } from '../ui/ResponseEditor';

/** One form made from the collection's fields, for adding a record or editing one. */
export function RowDialog({ backend, collection, row, onClose, onSaved }: { backend: string; collection: CollectionDef; row?: Record<string, unknown>; onClose: () => void; onSaved: () => void }) {
  const api = useApi();
  const editing = row !== undefined;
  const [form, setForm] = useState<RowForm>(() => (row === undefined ? blankRow(collection.fields) : rowToForm(collection.fields, row)));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: async () => {
      const result = formToRow(collection.fields, form, editing ? 'edit' : 'create');
      setProblems(result.problems);
      if (Object.keys(result.problems).length > 0) return false;
      if (row === undefined) await adminSend(api, backend, 'POST', `/data/${encodeURIComponent(collection.name)}`, result.values);
      else await adminSend(api, backend, 'PUT', `/data/${encodeURIComponent(collection.name)}/${encodeURIComponent(String(row.id))}`, result.values);
      return true;
    },
    onSuccess: (saved) => {
      if (saved) onSaved();
    },
  });
  const set = (name: string, value: string | boolean) => {
    setForm((current) => ({ ...current, [name]: value }));
  };

  return (
    <Modal title={editing ? `Edit record ${String(row.id)}` : `Add a record to ${collection.name}`} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        {collection.fields.length === 0 ? <p className="empty">This collection has no fields yet. Close this and choose Edit fields first.</p> : null}
        {collection.fields.map((field) => {
          const value = form[field.name];
          const label = `${field.name}${field.required ? ' *' : ''}`;
          let control: React.ReactNode;
          if (field.type === 'boolean') {
            control = (
              <input
                type="checkbox"
                checked={value === true}
                onChange={(event) => {
                  set(field.name, event.target.checked);
                }}
              />
            );
          } else if (field.type === 'enum') {
            control = (
              <select
                value={typeof value === 'string' ? value : ''}
                onChange={(event) => {
                  set(field.name, event.target.value);
                }}
              >
                <option value="">(none)</option>
                {(field.enumValues ?? []).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            );
          } else if (field.type === 'json') {
            control = (
              <ResponseEditor
                label={label}
                value={typeof value === 'string' ? value : ''}
                onChange={(text) => {
                  set(field.name, text);
                }}
                invalid={problems[field.name] !== undefined}
                height={120}
              />
            );
          } else {
            control = (
              <input
                value={typeof value === 'string' ? value : ''}
                inputMode={field.type === 'number' || field.type === 'relation' ? 'decimal' : undefined}
                placeholder={field.type === 'date' ? '2026-11-17' : field.type === 'relation' ? `id of a ${field.relationTo ?? 'record'}` : field.type === 'media' ? 'a media id' : ''}
                aria-invalid={problems[field.name] !== undefined}
                onChange={(event) => {
                  set(field.name, event.target.value);
                }}
              />
            );
          }
          return (
            <div key={field.name} className="stack tight">
              {field.type === 'json' ? (
                <div className="stack tight">
                  <span>{label}</span>
                  {control}
                </div>
              ) : (
                <label className={field.type === 'boolean' ? 'check' : undefined}>
                  {label}
                  {control}
                </label>
              )}
              {problems[field.name] === undefined ? null : <span className="error">{problems[field.name]}</span>}
            </div>
          );
        })}
        <ErrorNote error={save.error === null ? null : errorMessage(save.error)} />
        <div className="row end">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={save.isPending || collection.fields.length === 0}>
            {editing ? 'Save record' : 'Add record'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
