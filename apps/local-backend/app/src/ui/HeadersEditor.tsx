export type HeaderRows = [string, string][];

export const rowsFromHeaders = (headers: Record<string, string> | undefined): HeaderRows => Object.entries(headers ?? {});

/** The headers of the rows that have a name (a later row wins over an earlier one with the same name). */
export const headersFromRows = (rows: HeaderRows): Record<string, string> | undefined => {
  const named = rows.filter(([name]) => name.trim() !== '');
  return named.length === 0 ? undefined : Object.fromEntries(named.map(([name, value]) => [name.trim(), value]));
};

/** Name and value pairs for response headers. A value may use `{{...}}` dynamic values. */
export function HeadersEditor({ label, rows, onChange }: { label: string; rows: HeaderRows; onChange: (rows: HeaderRows) => void }) {
  return (
    <fieldset className="plain-fieldset">
      <legend>{label}</legend>
      {rows.length === 0 ? <span className="muted">None.</span> : null}
      {rows.map(([name, value], index) => (
        <div className="row" key={index}>
          <input
            aria-label={`${label}: name ${String(index + 1)}`}
            placeholder="x-api-version"
            value={name}
            onChange={(event) => {
              onChange(rows.map((row, at) => (at === index ? [event.target.value, row[1]] : row)));
            }}
          />
          <input
            className="grow"
            aria-label={`${label}: value ${String(index + 1)}`}
            placeholder="2"
            value={value}
            onChange={(event) => {
              onChange(rows.map((row, at) => (at === index ? [row[0], event.target.value] : row)));
            }}
          />
          <button
            type="button"
            className="ghost bad"
            aria-label={`Remove ${label} ${String(index + 1)}`}
            onClick={() => {
              onChange(rows.filter((_row, at) => at !== index));
            }}
          >
            Remove
          </button>
        </div>
      ))}
      <div>
        <button
          type="button"
          onClick={() => {
            onChange([...rows, ['', '']]);
          }}
        >
          Add header
        </button>
      </div>
    </fieldset>
  );
}
