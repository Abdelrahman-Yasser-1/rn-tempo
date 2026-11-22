import { useId, useState } from 'react';

import type { JsonSchema } from '../api/types';
import { fieldsFor, getAt, parseScalar, setAt, writeText, type FormField } from '../lib/jsonForm';

interface Props {
  schema: JsonSchema | undefined;
  /** The parsed value, or `undefined` when the text is empty. */
  value: unknown;
  /** The new value (a `setAt` copy). */
  onChange: (value: unknown) => void;
}

function Field({ field, root, onChange }: { field: FormField; root: unknown; onChange: (value: unknown) => void }) {
  const id = useId();
  const current = getAt(root, field.path);
  const [error, setError] = useState<string | undefined>(undefined);
  // What was typed, kept while the box has focus so a half-typed value such as "{{" is not undone.
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const label = `${field.name}${field.required ? ' *' : ''}`;
  const put = (value: unknown): void => {
    onChange(setAt(root, field.path, value));
  };

  if (field.kind === 'object') {
    return (
      <fieldset className="plain-fieldset">
        <legend>{label}</legend>
        {(field.children ?? []).map((child) => (
          <Field key={child.name} field={child} root={root} onChange={onChange} />
        ))}
      </fieldset>
    );
  }
  if (field.kind === 'boolean') {
    return (
      <label className="check">
        <input
          type="checkbox"
          checked={current === true}
          onChange={(event) => {
            put(event.target.checked);
          }}
        />
        {label}
      </label>
    );
  }
  if (field.kind === 'enum') {
    return (
      <label htmlFor={id}>
        {label}
        <select
          id={id}
          value={typeof current === 'string' ? current : ''}
          onChange={(event) => {
            put(event.target.value === '' ? undefined : event.target.value);
          }}
        >
          <option value="">(none)</option>
          {(field.enumValues ?? []).map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
    );
  }
  // A text box shows the value as text: a number or a placeholder in a number box, JSON for anything else.
  const text = current === undefined ? '' : typeof current === 'string' || typeof current === 'number' ? String(current) : writeText(current);
  return (
    <div className="stack tight">
      <label htmlFor={id}>
        {label}
        {field.description === undefined ? null : <span className="muted"> {field.description}</span>}
        <input
          id={id}
          className={field.kind === 'json' ? 'code-area' : undefined}
          value={draft ?? text}
          aria-invalid={error !== undefined}
          inputMode={field.kind === 'number' || field.kind === 'integer' ? 'decimal' : undefined}
          onBlur={() => {
            setDraft(undefined);
            setError(undefined);
          }}
          onChange={(event) => {
            setDraft(event.target.value);
            const read = parseScalar(field.kind, event.target.value);
            if (read.ok) {
              setError(undefined);
              put(read.value);
            } else setError(read.message);
          }}
        />
      </label>
      {error === undefined ? null : <span className="error">{error}</span>}
    </div>
  );
}

/** A form for an object value, made from its schema. It edits the same value as the JSON tab. */
export function JsonForm({ schema, value, onChange }: Props) {
  const root = value === undefined ? {} : value;
  if (typeof root !== 'object' || root === null || Array.isArray(root)) {
    return <p className="muted">The form is for a JSON object. Use the JSON tab to edit this value.</p>;
  }
  const fields = fieldsFor(schema, root);
  if (fields.length === 0) return <p className="muted">There are no fields to show yet. Use the JSON tab to add some.</p>;
  return (
    <div className="stack json-form">
      {fields.map((field) => (
        <Field key={field.name} field={field} root={root} onChange={onChange} />
      ))}
    </div>
  );
}
