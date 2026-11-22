import type { EditorAdapter, EditorHandle, EditorOptions } from '../editor/adapter';

/** The editor adapter of the tests: a textarea with the same contract as Monaco (Monaco does not run in jsdom). */
export interface FakeEditorLog {
  schemas: unknown[];
  diffs: (string | null)[];
  mounts: number;
}

export const fakeEditorLog: FakeEditorLog = { schemas: [], diffs: [], mounts: 0 };

function mount(host: HTMLElement, options: EditorOptions): EditorHandle {
  fakeEditorLog.mounts += 1;
  const box = document.createElement('textarea');
  box.setAttribute('aria-label', options.label);
  box.className = 'code-area';
  box.value = options.value;
  host.append(box);
  const listeners = new Set<(value: string) => void>();
  const tell = (): void => {
    for (const listener of listeners) listener(box.value);
  };
  box.addEventListener('input', tell);
  box.addEventListener('change', tell);
  if (options.schema !== undefined) fakeEditorLog.schemas.push(options.schema);
  return {
    getValue: () => box.value,
    setValue(value) {
      box.value = value;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    format() {
      try {
        box.value = JSON.stringify(JSON.parse(box.value), null, 2);
        tell();
      } catch {
        // Not valid JSON: nothing to format.
      }
      return Promise.resolve();
    },
    setSchema(schema) {
      fakeEditorLog.schemas.push(schema);
    },
    setMinimap: () => undefined,
    setDark: () => undefined,
    setDiff(original) {
      fakeEditorLog.diffs.push(original);
    },
    focus: () => box.focus(),
    dispose: () => box.remove(),
  };
}

export const fakeAdapter: EditorAdapter = { mount };
