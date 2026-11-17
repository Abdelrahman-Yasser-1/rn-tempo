import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';

import type { Client } from './client';
import type { EventsState, RequestEvent } from './types';

/** The real client: every call goes to a Rust command that `build.rs` lists and the capability grants. */
export const tauriClient: Client = {
  nodeInfo: (refresh) => invoke('node_info', { refresh }),
  listRecents: () => invoke('list_recents'),
  openProject: (path) => invoke('open_project', { path }),
  removeRecent: (path) => invoke('remove_recent', { path }),
  createWorkspace: (name, parent) => invoke('create_workspace', { name, parent }),
  projectState: (path) => invoke('project_state', { path }),
  cli: (path, action) => invoke('cli', { path, action }),
  control: (path, request) => invoke('control', { path, request }),
  subscribeEvents: (path) => invoke('subscribe_events', { path }),
  unsubscribeEvents: (path) => invoke('unsubscribe_events', { path }),
  listBootedSimulators: () => invoke('list_booted_simulators'),
  certStatus: (path) => invoke('cert_status', { path }),
  readWorkspace: (path) => invoke('read_workspace', { path }),
  writeWorkspace: (path, text) => invoke('write_workspace', { path, text }),
  openTarget: (path, target) => invoke('open_target', { path, target }),
  async pickFolder(title) {
    const chosen = await open({ directory: true, multiple: false, title });
    return typeof chosen === 'string' ? chosen : null;
  },
  async pickFile(title, extensions) {
    const chosen = await open({ directory: false, multiple: false, title, filters: [{ name: 'File', extensions }] });
    return typeof chosen === 'string' ? chosen : null;
  },
  async onRequest(handler) {
    return listen<RequestEvent>('tempo://request', (event) => {
      handler(event.payload);
    });
  },
  async onEventsState(handler) {
    return listen<EventsState>('tempo://events-state', (event) => {
      handler(event.payload);
    });
  },
};
