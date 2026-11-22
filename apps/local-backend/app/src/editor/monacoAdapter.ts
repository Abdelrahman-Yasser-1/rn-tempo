// The only file that imports Monaco. It is loaded on demand (`load.ts`), so it and its workers are separate chunks.
//
// Monaco is bundled with the app and runs offline. Its two workers (the editor's and the JSON language service's) are
// Vite `?worker` imports, served from the same origin as the page, so the CSP needs no CDN and no blob: URL. Only the
// editor features a JSON box needs are imported (not `editor.main`, which also brings 80 other languages).
import * as monaco from 'monaco-editor/editor/editor.api';
import { jsonDefaults } from 'monaco-editor/languages/features/json/register';
import 'monaco-editor/editor/browser/coreCommands';
import 'monaco-editor/editor/browser/widget/codeEditor/codeEditorWidget';
import 'monaco-editor/editor/browser/widget/diffEditor/diffEditor.contribution';
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching';
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard';
import 'monaco-editor/editor/contrib/codelens/browser/codelensController';
import 'monaco-editor/editor/contrib/contextmenu/browser/contextmenu';
import 'monaco-editor/editor/contrib/cursorUndo/browser/cursorUndo';
import 'monaco-editor/editor/contrib/dropOrPasteInto/browser/dropIntoEditorContribution';
import 'monaco-editor/editor/contrib/dropOrPasteInto/browser/copyPasteContribution';
import 'monaco-editor/editor/contrib/find/browser/findController';
import 'monaco-editor/editor/contrib/folding/browser/folding';
import 'monaco-editor/editor/contrib/format/browser/formatActions';
import 'monaco-editor/editor/contrib/gotoError/browser/gotoError';
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution';
import 'monaco-editor/editor/contrib/indentation/browser/indentation';
import 'monaco-editor/editor/contrib/linesOperations/browser/linesOperations';
import 'monaco-editor/editor/contrib/multicursor/browser/multicursor';
import 'monaco-editor/editor/contrib/smartSelect/browser/smartSelect';
import 'monaco-editor/editor/contrib/suggest/browser/suggestController';
import 'monaco-editor/editor/contrib/suggest/browser/suggestInlineCompletions';
import 'monaco-editor/editor/contrib/toggleTabFocusMode/browser/toggleTabFocusMode';
import 'monaco-editor/editor/contrib/tokenization/browser/tokenization';
import 'monaco-editor/editor/contrib/unicodeHighlighter/browser/unicodeHighlighter';
import 'monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter';
import 'monaco-editor/editor/contrib/wordOperations/browser/wordOperations';
import 'monaco-editor/editor/common/standaloneStrings';
import 'monaco-vs/base/browser/ui/codicons/codicon/codicon.css';
import 'monaco-vs/base/browser/ui/codicons/codicon/codicon-modifiers.css';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker?worker';

import type { JsonSchema } from '../api/types';
import { allowPlaceholders, placeholderRanges } from '../lib/placeholders';

import type { EditorAdapter, EditorHandle, EditorOptions } from './adapter';

self.MonacoEnvironment = {
  getWorker: (_id: string, label: string): Worker => (label === 'json' ? new JsonWorker() : new EditorWorker()),
};

let counter = 0;
/** The schema of each open editor, by model address. Monaco keeps one list of schemas for the whole JSON language. */
const schemas = new Map<string, JsonSchema>();

function publishSchemas(): void {
  jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: false,
    enableSchemaRequest: false,
    schemaValidation: 'error',
    schemas: [...schemas].map(([address, schema], index) => ({ uri: `inmemory://tempo/schema/${String(index)}.json`, fileMatch: [address], schema: allowPlaceholders(schema) })),
  });
}

const themeName = (dark: boolean): string => (dark ? 'vs-dark' : 'vs');

function mount(host: HTMLElement, options: EditorOptions): EditorHandle {
  counter += 1;
  const address = `inmemory://tempo/model-${String(counter)}.json`;
  const model = monaco.editor.createModel(options.value, 'json', monaco.Uri.parse(address));
  const editorEl = document.createElement('div');
  const diffEl = document.createElement('div');
  for (const element of [editorEl, diffEl]) element.style.cssText = 'width:100%;height:100%';
  diffEl.style.display = 'none';
  host.append(editorEl, diffEl);

  const common = { automaticLayout: true, scrollBeyondLastLine: false, tabSize: 2, fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', folding: true, wordWrap: 'on' as const, renderWhitespace: 'none' as const, padding: { top: 6, bottom: 6 } };
  monaco.editor.setTheme(themeName(options.dark));
  const editor = monaco.editor.create(editorEl, { ...common, model, ariaLabel: options.label, readOnly: options.readOnly === true, minimap: { enabled: options.minimap }, theme: themeName(options.dark) });
  let diff: monaco.editor.IStandaloneDiffEditor | undefined;
  let original: monaco.editor.ITextModel | undefined;

  const listeners = new Set<(value: string) => void>();
  let silent = false;
  const decorations = editor.createDecorationsCollection([]);
  const paint = (): void => {
    const text = model.getValue();
    decorations.set(
      placeholderRanges(text).map((range) => {
        const start = model.getPositionAt(range.from);
        const end = model.getPositionAt(range.to);
        return { range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column), options: { inlineClassName: 'tempo-placeholder', hoverMessage: { value: 'A dynamic value: the engine fills it in for each request.' } } };
      }),
    );
  };
  paint();
  const subscription = model.onDidChangeContent(() => {
    paint();
    if (!silent) for (const listener of listeners) listener(model.getValue());
  });
  if (options.schema !== undefined) {
    schemas.set(address, options.schema);
    publishSchemas();
  }

  return {
    getValue: () => model.getValue(),
    setValue(value) {
      if (value === model.getValue()) return;
      silent = true;
      model.setValue(value);
      silent = false;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async format() {
      const action = editor.getAction('editor.action.formatDocument');
      if (action !== null && action.isSupported()) {
        await action.run();
        return;
      }
      try {
        model.setValue(JSON.stringify(JSON.parse(model.getValue()), null, 2));
      } catch {
        // Not valid JSON: nothing to format.
      }
    },
    setSchema(schema) {
      if (schema === undefined) schemas.delete(address);
      else schemas.set(address, schema);
      publishSchemas();
    },
    setMinimap(on) {
      editor.updateOptions({ minimap: { enabled: on } });
    },
    setDark(dark) {
      monaco.editor.setTheme(themeName(dark));
    },
    setDiff(text) {
      if (text === null) {
        diff?.dispose();
        diff = undefined;
        original?.dispose();
        original = undefined;
        diffEl.style.display = 'none';
        editorEl.style.display = 'block';
        return;
      }
      editorEl.style.display = 'none';
      diffEl.style.display = 'block';
      original?.dispose();
      original = monaco.editor.createModel(text, 'json');
      diff ??= monaco.editor.createDiffEditor(diffEl, { ...common, renderSideBySide: true, originalEditable: false, readOnly: options.readOnly === true, minimap: { enabled: false } });
      diff.setModel({ original, modified: model });
    },
    focus: () => (diff === undefined ? editor.focus() : diff.getModifiedEditor().focus()),
    dispose() {
      subscription.dispose();
      diff?.dispose();
      original?.dispose();
      editor.dispose();
      model.dispose();
      schemas.delete(address);
      publishSchemas();
      editorEl.remove();
      diffEl.remove();
    },
  };
}

export const monacoAdapter: EditorAdapter = { mount };
