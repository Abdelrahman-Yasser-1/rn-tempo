import { spawn } from 'node:child_process';
import { closeSync, createReadStream, existsSync, openSync, readFileSync, rmSync, statSync, watchFile, unwatchFile } from 'node:fs';

import { defineCommand } from 'citty';
import qrcode from 'qrcode-terminal';

import { createServer } from '../server/app.ts';
import { createLogger } from '../server/logger.ts';
import { listen } from '../server/listen.ts';
import { CONTROL_HEADER } from '../runtime/scenarios.ts';
import { loadConfig } from './config.ts';
import { ensureControlToken, ensureDataDir, readControlToken, resolvePaths, DEFAULT_CONFIG, type Paths } from './paths.ts';
import { fetchHealth, isAlive, lanAddress, readPid, removePid, sleep, writePid } from './process.ts';

const commonArgs = {
  config: { type: 'string', description: `Config file (default ${DEFAULT_CONFIG})` },
  cwd: { type: 'string', description: 'Project folder (default: the current folder)' },
} as const;

const serverArgs = {
  ...commonArgs,
  port: { type: 'string', description: 'Port (default: the config port)' },
  host: { type: 'string', description: 'Address to listen on (default 0.0.0.0, so a phone can reach it)', default: '0.0.0.0' },
} as const;

/** Prints to stderr and fails the command, without a stack trace. */
function fail(message: string): never {
  process.stderr.write(`tempo-api: ${message}\n`);
  process.exit(1);
}

function parsePort(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) fail(`Invalid port "${value}".`);
  return port;
}

const say = (line = ''): void => void process.stdout.write(`${line}\n`);

function urls(host: string, port: number): { local: string; lan: string | undefined } {
  const lan = host === '127.0.0.1' || host === 'localhost' ? undefined : lanAddress();
  return { local: `http://localhost:${port}`, lan: lan === undefined ? undefined : `http://${lan}:${port}` };
}

async function printUrls(host: string, port: number, withQr = false): Promise<void> {
  const { local, lan } = urls(host, port);
  say(`  Local:  ${local}`);
  if (lan === undefined) return;
  say(`  LAN:    ${lan}`);
  if (!withQr) return;
  say();
  await new Promise<void>((done) => qrcode.generate(lan, { small: true }, (code) => (say(code), done())));
  say('  Scan with a phone on the same Wi-Fi. Use --host 127.0.0.1 to keep the server on this machine.');
}

/** Runs the server in this process. For Docker, debugging, and as the body of `up`'s child. */
export const start = defineCommand({
  meta: { name: 'start', description: 'Run the dev API in the foreground' },
  args: serverArgs,
  async run({ args }) {
    const paths = resolvePaths(args.cwd, args.config);
    let config;
    try {
      config = await loadConfig(paths.config);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
    const token = ensureControlToken(paths);
    const logger = createLogger({ level: process.env.TEMPO_API_LOG_LEVEL ?? 'info' });
    const server = createServer(config, { dataDir: paths.dataDir, fixturesDir: paths.fixturesDir, logger, controlToken: token });
    const port = parsePort(args.port) ?? config.port;
    let http;
    try {
      http = await listen(server, { port, host: args.host });
    } catch (error) {
      logger.error({ err: error instanceof Error ? error.message : String(error), port }, 'could not listen');
      process.exit(1);
    }
    logger.warn('Dev API: a mock server with public test credentials. Never use it in production.');
    logger.info({ port, host: args.host, endpoints: server.endpoints.length }, 'dev api listening');
    const stop = (): void => void http.close(() => process.exit(0));
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
  },
});

/** Starts the server as a detached process and waits until it answers. */
export const up = defineCommand({
  meta: { name: 'up', description: 'Start the dev API in the background' },
  args: serverArgs,
  async run({ args }) {
    const paths = resolvePaths(args.cwd, args.config);
    const existing = readPid(paths.pidFile);
    if (existing !== undefined) {
      const health = isAlive(existing.pid) ? await fetchHealth(existing.port) : undefined;
      if (health?.pid === existing.pid) {
        say(`The dev API is already running (pid ${existing.pid}).`);
        await printUrls(existing.host, existing.port, true);
        return;
      }
      removePid(paths.pidFile); // stale: the process is gone or the port belongs to something else
    }

    let configPort: number;
    try {
      // Loading here reports a broken config in the terminal instead of the log file.
      configPort = (await loadConfig(paths.config)).port;
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
    const port = parsePort(args.port) ?? configPort;
    ensureDataDir(paths);
    ensureControlToken(paths);

    const log = openSync(paths.logFile, 'a', 0o600);
    const script = process.argv[1];
    if (script === undefined) return fail('Cannot find the tempo-api script to start.');
    const child = spawn(
      process.execPath,
      [...process.execArgv, script, 'start', '--cwd', paths.cwd, '--config', paths.config, '--port', String(port), '--host', args.host],
      { detached: true, stdio: ['ignore', log, log], cwd: paths.cwd },
    );
    child.unref();
    closeSync(log);
    const pid = child.pid;
    if (pid === undefined) return fail('The server process did not start.');
    let exited = false;
    child.once('exit', () => (exited = true));

    // Only a health answer from OUR child counts; another dev API on the port must not pass.
    for (let waited = 0; waited < 15_000; waited += 100) {
      const health = await fetchHealth(port, 500);
      if (health?.pid === pid) {
        writePid(paths.pidFile, { pid, port, host: args.host });
        say('The dev API is running.');
        await printUrls(args.host, port, true);
        say(`  Logs:   tempo-api logs -f   (${paths.logFile})`);
        return;
      }
      if (exited) break;
      await sleep(100);
    }
    const tail = existsSync(paths.logFile) ? readFileSync(paths.logFile, 'utf8').trim().split('\n').slice(-5).join('\n') : '';
    if (isAlive(pid) && !exited) process.kill(pid, 'SIGTERM');
    return fail(`The dev API did not start on port ${port}.${tail === '' ? '' : `\nLast log lines:\n${tail}`}`);
  },
});

/** Stops the server that this folder's pid file names, after checking it really is the dev API. */
export const down = defineCommand({
  meta: { name: 'down', description: 'Stop the dev API' },
  args: commonArgs,
  async run({ args }) {
    const paths = resolvePaths(args.cwd, args.config);
    const record = readPid(paths.pidFile);
    if (record === undefined) return say('The dev API is not running.');
    if (!isAlive(record.pid)) {
      removePid(paths.pidFile);
      return say('The dev API was not running (removed a stale pid file).');
    }
    // A recycled pid or a reused port must never get a SIGTERM from us.
    const health = await fetchHealth(record.port);
    if (health?.pid !== record.pid) {
      removePid(paths.pidFile);
      return say(`Pid ${record.pid} is not the dev API, so it was left alone. Removed the stale pid file.`);
    }
    process.kill(record.pid, 'SIGTERM');
    for (let waited = 0; waited < 5000 && isAlive(record.pid); waited += 100) await sleep(100);
    if (isAlive(record.pid)) process.kill(record.pid, 'SIGKILL');
    removePid(paths.pidFile);
    say('The dev API is stopped.');
  },
});

export const status = defineCommand({
  meta: { name: 'status', description: 'Show whether the dev API is running' },
  args: commonArgs,
  async run({ args }) {
    const paths = resolvePaths(args.cwd, args.config);
    const record = readPid(paths.pidFile);
    const health = record !== undefined && isAlive(record.pid) ? await fetchHealth(record.port) : undefined;
    if (record === undefined || health?.pid !== record.pid) {
      say(record === undefined ? 'The dev API is not running.' : 'The dev API is not running (stale pid file; run `down` to clean it).');
      return;
    }
    say(`The dev API is running (pid ${record.pid}, started ${health.startedAt}).`);
    await printUrls(record.host, record.port);
    const active = Object.entries(health.scenarios);
    if (active.length > 0) {
      say('  Scenarios:');
      for (const [endpoint, name] of active) say(`    ${endpoint} -> ${name}`);
    }
  },
});

/** One log line, readable: `13:05:01 INFO  request GET /x 200 3ms`. Unparseable lines pass through. */
export function formatLogLine(line: string): string {
  try {
    const entry = JSON.parse(line) as Record<string, unknown>;
    const time = typeof entry.time === 'number' ? new Date(entry.time).toISOString().slice(11, 19) : '';
    const level = ({ 10: 'TRACE', 20: 'DEBUG', 30: 'INFO', 40: 'WARN', 50: 'ERROR', 60: 'FATAL' } as Record<number, string>)[entry.level as number] ?? '';
    const detail = typeof entry.method === 'string' ? ` ${entry.method} ${String(entry.url)} ${String(entry.status)} ${String(entry.ms)}ms` : '';
    return `${time} ${level.padEnd(5)} ${String(entry.msg ?? '')}${detail}`.trim();
  } catch {
    return line;
  }
}

export const logs = defineCommand({
  meta: { name: 'logs', description: 'Print the dev API log' },
  args: {
    ...commonArgs,
    follow: { type: 'boolean', alias: 'f', description: 'Keep printing new lines' },
    lines: { type: 'string', alias: 'n', description: 'How many recent lines to print', default: '50' },
    raw: { type: 'boolean', description: 'Print the JSON lines as written' },
  },
  async run({ args }) {
    const paths = resolvePaths(args.cwd, args.config);
    if (!existsSync(paths.logFile)) return fail(`No log yet (${paths.logFile}). Start the server with \`up\`.`);
    const show = (line: string): void => say(args.raw ? line : formatLogLine(line));
    const lines = readFileSync(paths.logFile, 'utf8').split('\n').filter((l) => l !== '');
    for (const line of lines.slice(-Number(args.lines))) show(line);
    if (!args.follow) return;

    let offset = statSync(paths.logFile).size;
    let pending = '';
    watchFile(paths.logFile, { interval: 200 }, (current) => {
      if (current.size < offset) offset = 0; // the file was truncated
      if (current.size === offset) return;
      createReadStream(paths.logFile, { start: offset, end: current.size - 1, encoding: 'utf8' }).on('data', (chunk) => {
        pending += chunk;
        const parts = pending.split('\n');
        pending = parts.pop() ?? '';
        for (const part of parts) if (part !== '') show(part);
      });
      offset = current.size;
    });
    const stop = (): void => (unwatchFile(paths.logFile), process.exit(0));
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  },
});

/** Calls an internal control route of the running server. */
async function control(paths: Paths, path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const record = readPid(paths.pidFile);
  const token = readControlToken(paths);
  const health = record !== undefined && isAlive(record.pid) ? await fetchHealth(record.port) : undefined;
  if (record === undefined || token === undefined || health?.pid !== record.pid) {
    return fail('The dev API is not running. Start it with `up`.');
  }
  const res = await fetch(`http://127.0.0.1:${record.port}/__tempo/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [CONTROL_HEADER]: token },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

export const reset = defineCommand({
  meta: { name: 'reset', description: 'Re-seed the stored data' },
  args: commonArgs,
  async run({ args }) {
    const paths = resolvePaths(args.cwd, args.config);
    const record = readPid(paths.pidFile);
    if (record === undefined || !isAlive(record.pid)) {
      // Not running: removing the file is the same as a reset, the next start seeds again.
      rmSync(`${paths.dataDir}/db.json`, { force: true });
      return say('The dev API is not running. Removed the stored data; it is seeded again on the next start.');
    }
    const res = await control(paths, 'reset', {});
    if (res.status !== 200) return fail(`Reset failed: ${String(res.body.detail ?? res.status)}`);
    say('The stored data is re-seeded.');
  },
});

const scenarioSet = defineCommand({
  meta: { name: 'set', description: 'Make an endpoint answer with a scenario' },
  args: {
    ...commonArgs,
    endpoint: { type: 'positional', description: 'Endpoint id, e.g. get.products.:id', required: true },
    name: { type: 'positional', description: 'Scenario name, e.g. notFound', required: true },
  },
  async run({ args }) {
    const res = await control(resolvePaths(args.cwd, args.config), 'scenario', { endpointId: args.endpoint, name: args.name });
    if (res.status !== 200) return fail(String(res.body.detail ?? `Request failed (${res.status}).`));
    say(`${args.endpoint} now answers with "${args.name}".`);
  },
});

const scenarioClear = defineCommand({
  meta: { name: 'clear', description: 'Remove one scenario, or all of them' },
  args: {
    ...commonArgs,
    endpoint: { type: 'positional', description: 'Endpoint id (omit to clear all)', required: false },
  },
  async run({ args }) {
    const res = await control(resolvePaths(args.cwd, args.config), 'scenario', { clear: true, endpointId: args.endpoint });
    if (res.status !== 200) return fail(String(res.body.detail ?? `Request failed (${res.status}).`));
    say(args.endpoint === undefined ? 'All scenarios are cleared.' : `Scenario of ${args.endpoint} is cleared.`);
  },
});

export const scenario = defineCommand({
  meta: { name: 'scenario', description: 'Switch responses live' },
  subCommands: { set: scenarioSet, clear: scenarioClear },
});
