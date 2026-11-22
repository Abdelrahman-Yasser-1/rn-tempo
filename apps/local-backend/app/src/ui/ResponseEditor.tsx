import { useState } from 'react';

import type { JsonSchema } from '../api/types';
import { inferSchema, readText, writeText } from '../lib/jsonForm';

import { JsonEditor } from './JsonEditor';
import { JsonForm } from './JsonForm';

interface Props {
  /** The accessible name of the editor (and the prefix of its tabs). */
  label: string;
  /** The JSON text. Both tabs edit this one value. */
  value: string;
  onChange: (value: string) => void;
  /** What the value should look like (from an imported file or the collection). Without one the form follows the value itself. */
  schema?: JsonSchema | undefined;
  /** The last saved text, for "Show changes". */
  saved?: string | undefined;
  height?: number;
  invalid?: boolean;
}

/**
 * Edits a JSON value two ways: a Form made from the schema, and the JSON text in a code editor. Both change the same text,
 * so nothing is lost when switching. Switching to the form needs valid JSON; the message says what to fix.
 */
export function ResponseEditor({ label, value, onChange, schema, saved, height, invalid }: Props) {
  const [tab, setTab] = useState<'json' | 'form'>('json');
  const [notice, setNotice] = useState<string | null>(null);
  const read = readText(value);

  const show = (next: 'json' | 'form'): void => {
    if (next === 'form' && !read.ok) {
      setNotice(`Fix the JSON before using the form: ${read.message}`);
      return;
    }
    setNotice(null);
    setTab(next);
  };

  return (
    <div className="response-editor">
      <div className="tabs small" role="tablist" aria-label={`${label} view`}>
        {(['json', 'form'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={tab === name ? 'tab active' : 'tab'}
            onClick={() => {
              show(name);
            }}
          >
            {name === 'json' ? 'JSON' : 'Form'}
          </button>
        ))}
      </div>
      {notice === null ? null : (
        <p className="error" role="alert">
          {notice}
        </p>
      )}
      {tab === 'json' ? (
        <JsonEditor label={label} value={value} onChange={onChange} schema={schema} saved={saved} {...(height === undefined ? {} : { height })} invalid={invalid === true || !read.ok} />
      ) : (
        <JsonForm
          schema={schema ?? (read.ok ? inferSchema(read.value) : undefined)}
          value={read.ok ? read.value : undefined}
          onChange={(next) => {
            onChange(writeText(next));
          }}
        />
      )}
    </div>
  );
}
