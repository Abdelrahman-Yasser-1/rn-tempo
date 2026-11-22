import { mkdtempSync, readdirSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { startBackend, type RunningBackend } from '../app.ts';
import { TEST_MODE_NOW } from '../constants.ts';
import type { Row } from '../store.ts';
import { loadTestSnapshotData, writeTestSnapshotFiles } from '../test-snapshot.ts';
import { validateRecord } from '../values.ts';
import { openSocket, openStream, postGraphql } from './live.ts';
import { loadSource, type LoadedSource } from './source.ts';
import type { TempoBackend, TempoBackendOptions } from './types.ts';

export type { RecordedRequest, SseEvent, TempoBackend, TempoBackendOptions, TestSocket, TestStream } from './types.ts';

type Hook = (fn: () => void | Promise<void>, timeoutMs?: number) => void;
interface JestGlobals {
  beforeAll?: Hook;
  afterAll?: Hook;
  beforeEach?: Hook;
}

const HOOK_TIMEOUT_MS = 30_000;
const quote = (name: string): string => `"${name.replace(/"/g, '""')}"`;

/**
 * A copy of the start state the backend can return to: the database is written to a file once (`VACUUM INTO`), attached,
 * and `restore()` empties each table and refills it from there. Much cheaper than a new engine, and the port stays.
 */
class Baseline {
  private readonly db: DatabaseSync;
  private readonly mediaRoot: string;

  constructor(db: DatabaseSync, workDir: string, mediaRoot: string) {
    this.db = db;
    this.mediaRoot = mediaRoot;
    const file = join(workDir, 'baseline.sqlite');
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    db.exec(`ATTACH DATABASE '${file.replace(/'/g, "''")}' AS base`);
  }

  restore(): void {
    const names = (schema: string): string[] => this.db.prepare(`SELECT name FROM ${schema}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all().map((row) => String(row.name));
    const inBase = new Set(names('base'));
    this.db.exec('PRAGMA foreign_keys = OFF');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const table of names('main')) {
        this.db.exec(`DELETE FROM main.${quote(table)}`);
        if (inBase.has(table)) this.db.exec(`INSERT INTO main.${quote(table)} SELECT * FROM base.${quote(table)}`);
      }
      this.db.exec('DELETE FROM main.sqlite_sequence');
      this.db.exec('INSERT INTO main.sqlite_sequence SELECT * FROM base.sqlite_sequence');
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    } finally {
      this.db.exec('PRAGMA foreign_keys = ON');
    }
    // Files that a test uploaded are not in the restored `_media`.
    const known = new Set(this.db.prepare('SELECT id FROM _media').all().map((row) => String(row.id)));
    for (const folder of readdirSync(this.mediaRoot, { withFileTypes: true })) {
      if (!folder.isDirectory() || folder.name === '.tmp') continue;
      for (const file of readdirSync(join(this.mediaRoot, folder.name))) if (!known.has(file)) unlinkSync(join(this.mediaRoot, folder.name, file));
    }
  }
}

/**
 * Creates the backend of a test file and, under Jest, registers its hooks: `beforeAll` starts it, `afterAll` stops it and,
 * with `isolate: 'test'`, `beforeEach` resets it. Without Jest's globals (Vitest without `globals`, a script) call
 * `start()` and `stop()` yourself.
 */
export function setupTempoBackend(options: TempoBackendOptions = {}): TempoBackend {
  const source = options.source ?? process.env.TEMPO_BACKEND ?? './backend';
  const apiKey = options.apiKey ?? process.env.TEMPO_BACKEND_KEY;
  const cacheDir = options.cacheDir ?? 'node_modules/.cache/tempo-backend';
  const testMode = options.testMode ?? true;
  const isolate = options.isolate ?? 'file';

  let running: RunningBackend | undefined;
  let workDir: string | undefined;
  let baseline: Baseline | undefined;
  let loaded: LoadedSource['from'] | undefined;
  let clock = new Date(TEST_MODE_NOW);
  let requestsAfter = 0;
  let starting: Promise<void> | undefined;
  let startMs: number | undefined;

  const engine = (): RunningBackend['engine'] => {
    if (running === undefined) throw new Error('The Tempo backend is not started. Under Jest its beforeAll starts it; elsewhere call start() first.');
    return running.engine;
  };

  const start = (): Promise<void> => {
    starting ??= (async (): Promise<void> => {
      const began = performance.now();
      const found = await loadSource({ source, apiKey, cacheDir, ...(options.warn === undefined ? {} : { warn: options.warn }) });
      loaded = found.from;
      workDir = mkdtempSync(join(tmpdir(), 'tempo-kit-'));
      const folder = join(workDir, 'backend');
      try {
        writeTestSnapshotFiles(found.snapshot, folder);
        running = await startBackend(folder, {
          port: 0,
          host: '127.0.0.1',
          https: false,
          adminListener: false,
          watch: false,
          memory: true,
          testMode,
          seed: 'tempo-test-kit',
          now: () => clock,
        });
        if (Object.keys(found.snapshot.tables).length > 0) loadTestSnapshotData(running.engine.store.db, found.snapshot);
        baseline = new Baseline(running.engine.store.db, workDir, running.engine.media.root);
        requestsAfter = lastRequestId();
        startMs = performance.now() - began;
      } catch (error) {
        await running?.stop().catch(() => undefined);
        running = undefined;
        rmSync(workDir, { recursive: true, force: true });
        starting = undefined;
        throw error;
      }
    })();
    return starting;
  };

  const lastRequestId = (): number => running?.engine.requests.snapshot().at(-1)?.id ?? 0;

  const stop = async (): Promise<void> => {
    const current = running;
    running = undefined;
    baseline = undefined;
    starting = undefined;
    await current?.stop();
    if (workDir !== undefined) rmSync(workDir, { recursive: true, force: true });
    workDir = undefined;
  };

  const reset = (): void => {
    const live = engine();
    baseline?.restore();
    live.clearScenario();
    live.resetSequences();
    live.webhooks.reset();
    clock = new Date(TEST_MODE_NOW);
    live.testClock = new Date(TEST_MODE_NOW);
    requestsAfter = lastRequestId();
  };

  const collectionOf = (name: string): ReturnType<typeof engine>['definition']['collections'][number] => {
    const found = engine().definition.collections.find((candidate) => candidate.name === name);
    if (found === undefined) throw new Error(`The backend has no collection "${name}".`);
    return found;
  };

  const backend: TempoBackend = {
    get url(): string {
      return running === undefined ? '' : `http://127.0.0.1:${String(running.port)}`;
    },
    get loaded(): LoadedSource['from'] | undefined {
      return loaded;
    },
    get startMs(): number | undefined {
      return startMs;
    },
    start,
    stop,
    scenario(endpointId, name) {
      // `404 notFound` (a status and the name) is accepted: the name is its last word.
      const scenario = name.trim().split(/\s+/).at(-1) ?? name;
      if (!engine().setScenario(endpointId, scenario)) throw new Error(`No endpoint "${endpointId}" with a scenario "${scenario}".`);
    },
    clearScenarios() {
      engine().clearScenario();
    },
    time: {
      set(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) throw new Error('time.set needs a date, a timestamp or an ISO string.');
        clock = date;
        engine().testClock = date;
      },
      reset() {
        clock = new Date(TEST_MODE_NOW);
        engine().testClock = new Date(TEST_MODE_NOW);
      },
    },
    data: {
      insert(collection, values) {
        const live = engine();
        const definition = collectionOf(collection);
        const checked = validateRecord(definition, values, { mode: 'create', unknownFields: 'reject', part: collection, exists: (name, id) => live.store.has(name, id) });
        if (checked.issues.length > 0) throw new Error(`Invalid ${collection} row: ${checked.issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')}`);
        return live.store.insert(collection, checked.values);
      },
      list(collection) {
        collectionOf(collection);
        return engine().store.list(collection).rows;
      },
      get(collection, id) {
        collectionOf(collection);
        const row: Row | undefined = engine().store.get(collection, id);
        return row;
      },
      remove(collection, id) {
        collectionOf(collection);
        return engine().store.remove(collection, id);
      },
    },
    ws: (path, socketOptions) => openSocket(backend.url, path, socketOptions),
    sse: (path, streamOptions) => openStream(backend.url, path, streamOptions),
    graphql: (query, variables, graphqlOptions) => postGraphql(backend.url, query, variables, graphqlOptions),
    events: { on: (listener) => engine().events.on(listener) },
    webhooks: { deliveries: () => engine().webhooks.captured() },
    requests: () => engine().requests.snapshot(requestsAfter),
    reset,
  };

  const jest = globalThis as unknown as JestGlobals;
  if (options.hooks !== false && typeof jest.beforeAll === 'function' && typeof jest.afterAll === 'function') {
    jest.beforeAll(start, HOOK_TIMEOUT_MS);
    jest.afterAll(stop, HOOK_TIMEOUT_MS);
    if (isolate === 'test' && typeof jest.beforeEach === 'function') jest.beforeEach(reset);
  }
  return backend;
}
