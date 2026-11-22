import { useState } from 'react';

import { schemaTree, type SchemaNode } from '../lib/schemaTree';

function Line({ node }: { node: SchemaNode }) {
  return (
    <li>
      {node.name === '' ? null : <code>{node.name}</code>} <span className="muted">{node.type}</span>
      {node.required ? <span className="req"> required</span> : null}
      {node.notes.length === 0 ? null : <span className="muted"> ({node.notes.join('; ')})</span>}
      {node.children.length === 0 ? null : (
        <ul className="schema-tree">
          {node.children.map((child, index) => (
            <Line key={`${child.name}-${String(index)}`} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** A JSON Schema shown as a readable tree, or as the raw JSON. */
export function SchemaView({ schema, label }: { schema: unknown; label: string }) {
  const [raw, setRaw] = useState(false);
  return (
    <div className="schema-view">
      <div className="row">
        <strong>{label}</strong>
        <span className="spacer" />
        <button
          type="button"
          className="ghost"
          aria-pressed={raw}
          aria-label={`${raw ? 'Show the tree' : 'Show the raw JSON'} of ${label}`}
          onClick={() => {
            setRaw(!raw);
          }}
        >
          {raw ? 'Tree' : 'Raw JSON'}
        </button>
      </div>
      {raw ? (
        <pre className="logbox">{JSON.stringify(schema, null, 2)}</pre>
      ) : (
        <ul className="schema-tree root" aria-label={`${label} (tree)`}>
          <Line node={schemaTree(schema)} />
        </ul>
      )}
    </div>
  );
}
