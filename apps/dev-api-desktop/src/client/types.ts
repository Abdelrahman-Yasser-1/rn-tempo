// The shapes the Rust side and the dev API return. Rust serializes with camelCase.

export type ProjectKind = 'code' | 'workspace';

export interface NodeInfo {
  ok: boolean;
  path: string | null;
  version: string | null;
  loginPath: string | null;
  message: string | null;
  docsUrl: string;
}

export interface Recent {
  path: string;
  name: string;
  kind: ProjectKind;
  appOwned: boolean;
}

export interface TempoApiInfo {
  source: 'project' | 'bundled';
  version: string | null;
}

export interface ProjectInfo {
  path: string;
  name: string;
  kind: ProjectKind;
  appOwned: boolean;
  tempoApi: TempoApiInfo | null;
}

export interface ProjectState {
  running: boolean;
  pid: number | null;
  port: number | null;
  scheme: 'http' | 'https' | null;
  startedByApp: boolean;
}

/** One of the fixed `tempo-api` commands the app may run. */
export type CliAction =
  | { kind: 'up'; port: number | null; http: boolean }
  | { kind: 'down' }
  | { kind: 'status' }
  | { kind: 'reset' }
  | { kind: 'certs'; install: boolean }
  | { kind: 'trustIos'; device: string }
  | { kind: 'trustAndroid'; push: boolean }
  | { kind: 'logs'; lines: number }
  | { kind: 'collections' }
  | { kind: 'importOpenapi'; file: string }
  | { kind: 'exportCode'; out: string; force: boolean };

export interface CliOutput {
  code: number;
  stdout: string;
  stderr: string;
}

export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  headers?: [string, string][];
  body?: string | null;
}

export interface HttpReply {
  status: number;
  body: string;
  ms: number;
  contentType: string | null;
}

export interface Simulator {
  udid: string;
  name: string;
  runtime: string;
}

export type OpenTarget = 'swagger' | 'openApi' | 'folder' | 'generatedFolder';

/** `GET /__tempo/info` */
export interface ServerInfo {
  service: 'tempo-dev-api';
  version: string;
  project: string;
  scheme: 'http' | 'https';
  port: number;
  urls: { local: string; lan?: string; androidEmulator: string; iosSimulator: string };
  cert: { present: boolean; notAfter?: string; coversLanIp?: boolean };
  startedAt: string;
}

/** One item of `GET /__tempo/endpoints` */
export interface EndpointSummary {
  id: string;
  method: string;
  path: string;
  auth: string | null;
  summary: string | null;
  tags: string[];
  scenarios: string[];
}

/** One entry of the server's request log (`/__tempo/events`), already redacted by the server. */
export interface RequestEntry {
  id: number;
  at: string;
  method: string;
  url: string;
  status: number;
  ms: number;
  scenario?: string;
  req: { headers: unknown; body: unknown; truncated?: true };
  res: { body: unknown; truncated?: true };
}

export interface RequestEvent {
  project: string;
  entry: RequestEntry;
}

export interface EventsState {
  project: string;
  connected: boolean;
}
