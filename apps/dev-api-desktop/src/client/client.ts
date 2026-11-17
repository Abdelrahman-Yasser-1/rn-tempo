import type {
  CertFiles,
  CliAction,
  CliOutput,
  EventsState,
  HttpReply,
  HttpRequest,
  NodeInfo,
  OpenTarget,
  ProjectInfo,
  ProjectState,
  Recent,
  RequestEvent,
  Simulator,
} from './types';

/**
 * Everything the UI asks of the app shell. The real implementation (`tauri.ts`) calls Rust; tests
 * pass a fake. The UI holds no API logic: it only asks Rust to run the CLI or to call the server.
 */
export interface Client {
  nodeInfo(refresh: boolean): Promise<NodeInfo>;
  listRecents(): Promise<Recent[]>;
  openProject(path: string): Promise<ProjectInfo>;
  removeRecent(path: string): Promise<Recent[]>;
  createWorkspace(name: string, parent: string | null): Promise<ProjectInfo>;
  projectState(path: string): Promise<ProjectState>;
  cli(path: string, action: CliAction): Promise<CliOutput>;
  control(path: string, request: HttpRequest): Promise<HttpReply>;
  subscribeEvents(path: string): Promise<void>;
  unsubscribeEvents(path: string): Promise<void>;
  listBootedSimulators(): Promise<Simulator[]>;
  certStatus(path: string): Promise<CertFiles>;
  readWorkspace(path: string): Promise<string>;
  writeWorkspace(path: string, text: string): Promise<void>;
  openTarget(path: string, target: OpenTarget): Promise<void>;
  /** Folder picker. `null` when the user cancels. */
  pickFolder(title: string): Promise<string | null>;
  /** File picker. `null` when the user cancels. */
  pickFile(title: string, extensions: string[]): Promise<string | null>;
  onRequest(handler: (event: RequestEvent) => void): Promise<() => void>;
  onEventsState(handler: (event: EventsState) => void): Promise<() => void>;
}
