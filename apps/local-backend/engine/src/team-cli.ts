import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { DEFAULT_AUDIT_DAYS } from './audit-log.ts';
import { DefinitionError } from './schema.ts';
import { DEFAULT_TEAM_PORT, startTeam } from './team-server.ts';
import { TeamAuth } from './team-auth.ts';
import { loadServerSecret } from './team-secret.ts';
import { TeamStore } from './team-store.ts';

export const defaultServerDir = (): string => join(homedir(), '.tempo-local-backend', 'server');

export interface ServerArgs {
  'data-dir'?: string | undefined;
  'backends-dir'?: string | undefined;
  port?: string | undefined;
  host?: string | undefined;
  'trust-proxy'?: string | undefined;
  'audit-days'?: string | undefined;
  'public-origin'?: string | undefined;
  email?: string | undefined;
  name?: string | undefined;
  'password-stdin'?: boolean | undefined;
  'reset-totp'?: boolean | undefined;
  'allow-private-import-urls'?: boolean | undefined;
}

const say = (line = ''): void => void process.stdout.write(`${line}\n`);

function intOption(value: string | undefined, name: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!(Number.isInteger(parsed) && parsed >= min && parsed <= max)) throw new DefinitionError(`${name} must be a number from ${String(min)} to ${String(max)}.`);
  return parsed;
}

/** A line from a terminal with the typed characters hidden. Ctrl+C aborts. */
function promptHidden(label: string): Promise<string> {
  return new Promise((resolveLine, reject) => {
    const input = process.stdin;
    if (!input.isTTY) return reject(new DefinitionError('There is no terminal to ask for a password. Pipe it in with --password-stdin.'));
    process.stderr.write(label);
    let value = '';
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    const finish = (): void => {
      input.setRawMode(false);
      input.pause();
      input.off('data', onData);
      process.stderr.write('\n');
    };
    const onData = (chunk: string): void => {
      for (const char of chunk) {
        if (char === '\u0003') {
          finish();
          return reject(new DefinitionError('Cancelled.'));
        }
        if (char === '\r' || char === '\n') {
          finish();
          return resolveLine(value);
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    input.on('data', onData);
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Buffer));
  // Only the line break a pipe adds is removed; spaces are part of a password.
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

async function passwordFrom(args: ServerArgs): Promise<string> {
  if (args['password-stdin'] === true) return readStdin();
  const first = await promptHidden('Password: ');
  const second = await promptHidden('Repeat the password: ');
  if (first !== second) throw new DefinitionError('The two passwords differ.');
  return first;
}

function openAuth(args: ServerArgs): { auth: TeamAuth; store: TeamStore } {
  const dataDir = resolve(args['data-dir'] ?? process.env.TEMPO_DATA_DIR ?? defaultServerDir());
  const store = new TeamStore(dataDir);
  return { auth: new TeamAuth(store, loadServerSecret(dataDir)), store };
}

/** `server owner create|reset-password`: the only way an owner comes to exist. Nothing on the network reaches it. */
export async function ownerCommand(sub: string | undefined, args: ServerArgs): Promise<void> {
  if (sub !== 'create' && sub !== 'reset-password') throw new DefinitionError('Use `server owner create --email <email>` or `server owner reset-password --email <email>`.');
  if (args.email === undefined) throw new DefinitionError(`owner ${sub} needs --email <email>.`);
  const { auth, store } = openAuth(args);
  try {
    const password = await passwordFrom(args);
    if (sub === 'create') {
      const owner = await auth.createOwner({ email: args.email, name: args.name ?? '', password });
      say(`Owner ${owner.email} created. Sign in on the dashboard with that email and password.`);
    } else {
      await auth.resetOwnerPassword(args.email, password, args['reset-totp'] === true);
      say('The owner password was changed.');
    }
  } catch (error) {
    throw error instanceof DefinitionError ? error : new DefinitionError(error instanceof Error ? error.message : String(error));
  } finally {
    store.close();
  }
}

/** `server`: the team server. It listens on plain HTTP: put a TLS proxy (Caddy) in front of it. */
export async function serverCommand(args: ServerArgs): Promise<void> {
  const dataDir = resolve(args['data-dir'] ?? process.env.TEMPO_DATA_DIR ?? defaultServerDir());
  const backendsDir = resolve(args['backends-dir'] ?? process.env.TEMPO_BACKENDS_DIR ?? join(dataDir, 'backends'));
  const port = intOption(args.port ?? process.env.PORT, '--port', 0, 65_535) ?? DEFAULT_TEAM_PORT;
  const auditDays = intOption(args['audit-days'] ?? process.env.TEMPO_AUDIT_DAYS, '--audit-days', 1, 3650) ?? DEFAULT_AUDIT_DAYS;
  const trustValue = args['trust-proxy'] ?? process.env.TEMPO_TRUST_PROXY;
  const trustProxy = trustValue === undefined || trustValue === '' ? [] : trustValue.split(',').map((item) => item.trim()).filter((item) => item !== '');
  const publicOrigin = args['public-origin'] ?? process.env.TEMPO_PUBLIC_ORIGIN;
  if (publicOrigin !== undefined && publicOrigin !== '' && !/^https?:\/\/[^/]+$/.test(publicOrigin)) throw new DefinitionError('--public-origin must be an origin such as https://api.example.com.');
  const running = await startTeam({ dataDir, backendsDir, port, host: args.host ?? '0.0.0.0', trustProxy, auditDays, allowPrivateImportUrls: args['allow-private-import-urls'] === true || process.env.TEMPO_ALLOW_PRIVATE_IMPORT_URLS === '1', ...(publicOrigin === undefined || publicOrigin === '' ? {} : { publicOrigin }) });
  say('Tempo Local Backend (team server)');
  say(`  Listening:   http://${args.host ?? '0.0.0.0'}:${String(running.port)}  (plain HTTP: keep it behind a TLS proxy)`);
  say(`  Data:        ${dataDir}`);
  say(`  Backends:    ${backendsDir}  (public APIs at /b/<id>/...)`);
  say(`  Proxy trust: ${trustProxy.length === 0 ? 'off (cookies are not marked Secure, X-Forwarded-* is ignored)' : trustProxy.join(', ')}`);
  say(`  Public APIs: ${publicOrigin === undefined || publicOrigin === '' ? 'on the dashboard origin under /b/<id> (answered sandboxed; use --public-origin for a separate host)' : publicOrigin}`);
  say(`  Import URLs: ${args['allow-private-import-urls'] === true || process.env.TEMPO_ALLOW_PRIVATE_IMPORT_URLS === '1' ? 'private network addresses allowed' : 'private network addresses refused'}`);
  say(`  Audit log:   kept ${String(auditDays)} days`);
  if (!running.store.hasOwner()) say('  No owner yet. Create one: tempo-local-backend server owner create --email <you@example.com>');
  const stop = (): void => void running.stop().then(() => process.exit(0));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
