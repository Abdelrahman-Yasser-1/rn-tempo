import { useEffect, useRef, useState } from 'react';

import type { JsonSchema } from '../api/types';
import type { EditorHandle } from '../editor/adapter';
import { loadAdapter, peekAdapter } from '../editor/load';

/** Whether the page is in dark mode (the editor theme follows it). */
function useDark(): boolean {
  const query = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined;
  const [dark, setDark] = useState(query?.matches ?? false);
  useEffect(() => {
    if (query === undefined) return;
    const listener = (event: MediaQueryListEvent): void => {
      setDark(event.matches);
    };
    query.addEventListener('change', listener);
    return () => {
      query.removeEventListener('change', listener);
    };
  }, [query]);
  return dark;
}

interface Props {
  /** The accessible name of the editor. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The JSON Schema to validate and complete against. Placeholders such as `{{params.id}}` are accepted anywhere. */
  schema?: JsonSchema | undefined;
  /** The last saved text: when it differs from `value`, "Show changes" opens a diff against it. */
  saved?: string | undefined;
  height?: number;
  invalid?: boolean;
}

/**
 * A JSON editor: Monaco with formatting, validation, folding, find and replace, a minimap switch, a diff against the last saved
 * text and a light or dark theme. Monaco loads the first time one opens; until then (and if it cannot load) a plain text box
 * holds the same value.
 */
export function JsonEditor({ label, value, onChange, schema, saved, height = 200, invalid = false }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<EditorHandle | null>(null);
  const [adapter, setAdapter] = useState(peekAdapter);
  const [failed, setFailed] = useState(false);
  const [minimap, setMinimap] = useState(false);
  const [diff, setDiff] = useState(false);
  const dark = useDark();
  const latest = useRef({ value, onChange, schema, label, dark, minimap });
  // The mount effect and the change listener read the newest props from here, so they never go stale.
  useEffect(() => {
    latest.current = { value, onChange, schema, label, dark, minimap };
  });

  useEffect(() => {
    if (adapter !== undefined) return;
    let live = true;
    loadAdapter().then(
      (loaded) => {
        if (live) setAdapter(loaded);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [adapter]);

  useEffect(() => {
    if (adapter === undefined || host.current === null) return;
    const current = latest.current;
    const mounted = adapter.mount(host.current, { value: current.value, label: current.label, dark: current.dark, minimap: current.minimap, schema: current.schema });
    handle.current = mounted;
    const stop = mounted.onChange((next) => {
      latest.current.onChange(next);
    });
    return () => {
      stop();
      mounted.dispose();
      handle.current = null;
    };
  }, [adapter]);

  useEffect(() => {
    if (handle.current !== null && handle.current.getValue() !== value) handle.current.setValue(value);
  }, [value, adapter]);
  useEffect(() => {
    handle.current?.setSchema(schema);
  }, [schema, adapter]);
  useEffect(() => {
    handle.current?.setDark(dark);
  }, [dark, adapter]);
  useEffect(() => {
    handle.current?.setMinimap(minimap);
  }, [minimap, adapter]);
  const changed = saved !== undefined && saved !== value;
  useEffect(() => {
    handle.current?.setDiff(diff && saved !== undefined ? saved : null);
  }, [diff, saved, adapter]);

  const format = (): void => {
    if (handle.current !== null) {
      void handle.current.format();
      return;
    }
    try {
      onChange(JSON.stringify(JSON.parse(value), null, 2));
    } catch {
      // Not valid JSON: nothing to format.
    }
  };

  return (
    <div className="json-editor" data-invalid={invalid ? 'true' : undefined}>
      <div className="json-tools" role="toolbar" aria-label={`${label} tools`}>
        <button type="button" className="ghost" onClick={format}>
          Format
        </button>
        <label className="check">
          <input
            type="checkbox"
            checked={minimap}
            onChange={(event) => {
              setMinimap(event.target.checked);
            }}
          />
          Minimap
        </label>
        {saved === undefined ? null : (
          <button
            type="button"
            className="ghost"
            aria-pressed={diff}
            disabled={!changed && !diff}
            onClick={() => {
              setDiff(!diff);
            }}
          >
            {diff ? 'Back to editing' : 'Show changes'}
          </button>
        )}
        <span className="muted json-hint">Shift+Alt+F formats. {'{{'}...{'}}'} is a dynamic value.</span>
      </div>
      {adapter === undefined ? (
        <textarea
          className="code-area json-fallback"
          style={{ height }}
          rows={Math.max(4, Math.round(height / 18))}
          spellCheck={false}
          aria-label={label}
          aria-invalid={invalid}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      ) : (
        <div ref={host} className="json-host" style={{ height }} />
      )}
      {failed ? <p className="muted">The code editor could not load, so this is a plain text box. Everything still works.</p> : null}
    </div>
  );
}
