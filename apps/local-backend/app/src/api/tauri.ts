import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import type { Api } from './client';
import type { EventsState, RequestEvent, UploadProgress } from './types';

/** The real client: every call goes to a Rust command that `build.rs` lists and the capability grants. */
export const tauriApi: Api = {
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
  saveExport: (fileName, extension, text) => invoke('save_export', { fileName, extension, text }),
  uploadMedia: (path) => invoke('upload_media', { path }),
  uploadDropped: (path) => invoke('upload_dropped', { path }),
  mediaPreview: (path, id) => invoke<ArrayBuffer>('media_preview', { path, id }),
  downloadMedia: (path, id) => invoke('download_media', { path, id }),
  subscribeRequests: (path) => invoke('subscribe_requests', { path }),
  unsubscribeRequests: (path) => invoke('unsubscribe_requests', { path }),
  async onRequest(handler) {
    return listen<RequestEvent>('lb://request', (event) => {
      handler(event.payload);
    });
  },
  async onEventsState(handler) {
    return listen<EventsState>('lb://events-state', (event) => {
      handler(event.payload);
    });
  },
  async onUpload(handler) {
    return listen<UploadProgress>('lb://upload', (event) => {
      handler(event.payload);
    });
  },
  async onDropped(handler) {
    return listen<number>('lb://dropped', (event) => {
      handler(event.payload);
    });
  },
};
