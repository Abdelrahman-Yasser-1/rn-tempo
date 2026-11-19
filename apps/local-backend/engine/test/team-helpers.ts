import { request } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startTeam, type RunningTeam, type TeamOptions } from '../src/team-server.ts';

export const PASSWORD = 'correct horse battery';

export interface Answer {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  json: () => Record<string, unknown>;
}

export function rawCall(port: number, options: { method?: string; path: string; headers?: Record<string, string>; body?: string }): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method: options.method ?? 'GET', path: options.path, headers: options.headers }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body, json: () => JSON.parse(body) as never }));
    });
    req.once('error', reject);
    req.end(options.body);
  });
}

/** A browser: a cookie jar, the CSRF token and the Origin it sends. */
export class Browser {
  cookie = '';
  csrf = '';
  readonly origin: string;
  readonly port: number;
  readonly extra: Record<string, string>;

  constructor(port: number, extra: Record<string, string> = {}) {
    this.port = port;
    this.origin = `http://127.0.0.1:${String(port)}`;
    this.extra = extra;
  }

  async login(email: string, password = PASSWORD, code?: string): Promise<Answer> {
    const answer = await rawCall(this.port, {
      method: 'POST',
      path: '/__session',
      headers: { 'content-type': 'application/json', origin: this.origin, ...this.extra },
      body: JSON.stringify({ email, password, ...(code === undefined ? {} : { code }) }),
    });
    if (answer.status === 200) {
      this.cookie = String(answer.headers['set-cookie']).split(';')[0] ?? '';
      this.csrf = String(answer.json().csrf);
    }
    return answer;
  }

  call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Answer> {
    const mutating = method !== 'GET';
    return rawCall(this.port, {
      method,
      path,
      headers: {
        cookie: this.cookie,
        ...(mutating ? { origin: this.origin, 'x-csrf-token': this.csrf } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...this.extra,
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  hub(method: string, path: string, body?: unknown): Promise<Answer> {
    return this.call(method, `/__hub${path}`, body);
  }

  admin(backend: string, method: string, path: string, body?: unknown): Promise<Answer> {
    return this.call(method, `/__admin/b/${backend}${path}`, body);
  }
}

export interface Site {
  team: RunningTeam;
  dir: string;
  clock: { now: number };
  owner: Browser;
  browser: (extra?: Record<string, string>) => Browser;
}

const sites: { team: RunningTeam; dir: string }[] = [];

export async function stopTeams(): Promise<void> {
  for (const site of sites.splice(0)) {
    await site.team.stop();
    rmSync(site.dir, { recursive: true, force: true });
  }
}

/** A team server on a free port with the owner made the way the CLI does (through `TeamAuth`) and a `demo` products backend. */
export async function startSite(options: Partial<TeamOptions> & { backend?: boolean } = {}): Promise<Site> {
  const dir = mkdtempSync(join(tmpdir(), 'lb-team-'));
  const clock = { now: Date.now() };
  const { backend, ...rest } = options;
  const team = await startTeam({
    dataDir: join(dir, 'data'),
    backendsDir: join(dir, 'backends'),
    port: 0,
    host: '127.0.0.1',
    clock: () => clock.now,
    registry: { start: { watch: false } },
    ...rest,
  });
  sites.push({ team, dir });
  await team.auth.createOwner({ email: 'owner@example.com', name: 'Olive Owner', password: PASSWORD });
  const make = (extra?: Record<string, string>): Browser => new Browser(team.port, extra);
  const owner = make();
  expectOk(await owner.login('owner@example.com'));
  if (backend !== false) expectOk(await owner.hub('POST', '/backends', { id: 'demo', name: 'Demo', preset: 'products' }));
  return { team, dir, clock, owner, browser: make };
}

function expectOk(answer: Answer): void {
  if (answer.status >= 300) throw new Error(`setup call failed with ${String(answer.status)}: ${answer.body.slice(0, 200)}`);
}

/** Invites someone to `demo`, sets their password through the link and returns a signed-in browser. */
export async function member(site: Site, email: string, role: 'viewer' | 'editor' | 'admin', backend = 'demo'): Promise<Browser> {
  const invited = await site.owner.hub('POST', `/backends/${backend}/members`, { email, name: email.split('@')[0], role });
  expectOk(invited);
  const token = String((invited.json().setup as { token: string }).token);
  const browser = site.browser();
  const done = await rawCall(site.team.port, { method: 'POST', path: '/__setup', headers: { 'content-type': 'application/json', origin: browser.origin }, body: JSON.stringify({ token, password: PASSWORD }) });
  expectOk(done);
  expectOk(await browser.login(email));
  return browser;
}
