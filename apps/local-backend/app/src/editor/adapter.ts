import type { JsonSchema } from '../api/types';

/**
 * The thin layer between the app and the Monaco editor. Components only know these types, so they can be tested with a
 * plain textarea (`src/test/fakeEditor.ts`) and Monaco itself stays in one lazily loaded file (`monacoAdapter.ts`).
 */
export interface EditorOptions {
  value: string;
  /** The accessible name of the editor. */
  label: string;
  readOnly?: boolean;
  dark: boolean;
  minimap: boolean;
  schema?: JsonSchema | undefined;
}

export interface EditorHandle {
  getValue(): string;
  /** Replaces the text without calling the change listeners. */
  setValue(value: string): void;
  onChange(listener: (value: string) => void): () => void;
  /** Formats the document (Shift+Alt+F does the same). Resolves when done. */
  format(): Promise<void>;
  /** The JSON Schema to validate and complete against (with placeholders allowed), or none. */
  setSchema(schema: JsonSchema | undefined): void;
  setMinimap(on: boolean): void;
  setDark(dark: boolean): void;
  /** Shows the changes against `original` (side by side), or the plain editor again with `null`. */
  setDiff(original: string | null): void;
  focus(): void;
  dispose(): void;
}

export interface EditorAdapter {
  mount(host: HTMLElement, options: EditorOptions): EditorHandle;
}
