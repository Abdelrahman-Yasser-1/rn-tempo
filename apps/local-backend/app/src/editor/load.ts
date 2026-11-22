import type { EditorAdapter } from './adapter';

let loaded: EditorAdapter | undefined;
let pending: Promise<EditorAdapter> | undefined;

/**
 * Loads the Monaco adapter the first time an editor opens. It is a dynamic import, so Monaco and its workers are a separate
 * chunk and the dashboard's first load does not pay for them.
 */
export function loadAdapter(): Promise<EditorAdapter> {
  pending ??= import('./monacoAdapter').then((module) => {
    loaded = module.monacoAdapter;
    return module.monacoAdapter;
  });
  return pending;
}

/** The adapter when it is already loaded (the editor then renders at once), else `undefined`. */
export const peekAdapter = (): EditorAdapter | undefined => loaded;
