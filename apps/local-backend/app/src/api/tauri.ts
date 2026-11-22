import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { listen as tauriListen } from '@tauri-apps/api/event';

import { DESKTOP_CAPABILITIES, type Backend } from './client';
import type { EventsState, RequestEvent, UploadProgress } from './types';

/** The two Tauri calls the transport needs. Tests pass fakes; the app passes the real ones. */
export interface TauriDeps {
  invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
  // The type parameter mirrors Tauri's own `listen<T>`, so the payload type of each event is stated where it is used.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  listen: <T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>;
}

/** The desktop transport: every call goes to a Rust command that `build.rs` lists and the capability grants. */
export function createTauriTransport({ invoke, listen }: TauriDeps): Backend {
  return {
    capabilities: DESKTOP_CAPABILITIES,
    session: null,
    team: null,
    listUnlisted: () => Promise.resolve([]),
    openNamed: () => Promise.reject(new Error('Backends are opened from a folder in the desktop app.')),
    listBackends: () => invoke('list_backends'),
    backendStatus: (path) => invoke('backend_status', { path }),
    pickNewFolder: () => invoke('pick_new_folder'),
    createBackend: (path, name, preset, port) => invoke('create_backend', { path, name, preset, port }),
    openBackend: () => invoke('open_backend'),
    removeBackend: (path) => invoke('remove_backend', { path }),
    startBackend: (path, port) => invoke('start_backend', { path, port }),
    stopBackend: (path) => invoke('stop_backend', { path }),
    admin: (path, request) => invoke('admin', { path, request }),
    tryIt: (path, request) => invoke('try_it', { path, request }),
    certInfo: (path) => invoke('cert_info', { path }),
    engineCli: (path, action) => invoke('engine_cli', { path, action }),
    checkOpenapi: (path) => invoke('check_openapi', { path }),
    exportSnapshot: (path) => invoke('export_snapshot', { path }),
    restoreSnapshot: () => invoke('restore_snapshot'),
    listSimulators: () => invoke('list_simulators'),
    reveal: (path, target) => invoke('reveal', { path, target }),
    openDocs: (path, target) => invoke('open_docs', { path, target }),
    createHandler: (path, name) => invoke('create_handler', { path, name }),
    engineLog: (path) => invoke('engine_log', { path }),
    pickImportFile: () => invoke('pick_import_file'),
    pickApiFile: () => invoke('pick_api_file'),
    saveExport: (fileName, extension, text) => invoke('save_export', { fileName, extension, text }),
    uploadMedia: (path) => invoke('upload_media', { path }),
    uploadDropped: (path) => invoke('upload_dropped', { path }),
    mediaPreview: (path, id) => invoke<ArrayBuffer>('media_preview', { path, id }),
    downloadMedia: (path, id) => invoke('download_media', { path, id }),
    subscribeRequests: (path) => invoke('subscribe_requests', { path }),
    unsubscribeRequests: (path) => invoke('unsubscribe_requests', { path }),
    onRequest: (handler) => listen<RequestEvent>('lb://request', (event) => { handler(event.payload); }),
    onEventsState: (handler) => listen<EventsState>('lb://events-state', (event) => { handler(event.payload); }),
    onUpload: (handler) => listen<UploadProgress>('lb://upload', (event) => { handler(event.payload); }),
    onDropped: (handler) => listen<number>('lb://dropped', (event) => { handler(event.payload); }),
  };
}

export const tauriApi: Backend = createTauriTransport({ invoke: tauriInvoke, listen: tauriListen });
