import { useId, useState } from 'react';

import { PLACEHOLDER_HELP } from '../lib/placeholders';

/** A button that opens a list of the `{{...}}` dynamic values a response may use. */
export function DynamicValuesHelp() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="help-popover">
      <button
        type="button"
        className="ghost"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open);
        }}
      >
        Dynamic values
      </button>
      {open ? (
        <div id={id} role="region" aria-label="Dynamic values">
          <p className="muted">
            Put these in a body or a header value. A string that is only one of them keeps the value&apos;s type (a number stays a number); inside other text it becomes text. A missing value is <code>null</code> or empty. Nothing is run: these are lookups only.
          </p>
          <dl>
            {PLACEHOLDER_HELP.map((item) => (
              <div key={item.token}>
                <dt>{item.token}</dt>
                <dd>{item.meaning}</dd>
              </div>
            ))}
          </dl>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
            }}
          >
            Close
          </button>
        </div>
      ) : null}
    </span>
  );
}
