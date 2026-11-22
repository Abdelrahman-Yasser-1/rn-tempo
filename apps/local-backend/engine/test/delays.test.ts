import { afterEach, describe, expect, it, vi } from 'vitest';

import { TEST_DELAYS_HEADER, TEST_MODE_HEADER } from '../src/constants.ts';
import { Rng } from '../src/import/generate.ts';
import { PRESET_PROFILES, planNetwork, requestSeed, sleepFor, testModeOf, ThrottleStream } from '../src/network.ts';
import { BackendSchema, type BackendInput } from '../src/schema.ts';
import { member, startSite, stopTeams } from './team-helpers.ts';
import { serve, stopAll } from './helpers.ts';

afterEach(async () => {
  vi.useRealTimers();
  await stopAll();
  await stopTeams();
});

const parse = (input: BackendInput) => BackendSchema.parse(input);
const rng = (id = 1): Rng => new Rng(requestSeed('seed', id));

describe('AC-LP-6 delay and network settings in backend.json', () => {
  it('AC-LP-6 accepts fixed and random latency, presets and a test mode switch, and names bad ranges', () => {
    const ok = parse({
      name: 'x',
      latency: { default: { minMs: 100, maxMs: 900 } },
      network: { preset: '4g' },
      testMode: true,
      endpoints: [{ id: 'a', type: 'static', method: 'GET', path: '/a', latency: { fixedMs: 5 }, network: 'inherit' }],
    });
    expect(ok.latency?.default).toEqual({ minMs: 100, maxMs: 900 });
    expect(() => parse({ name: 'x', latency: { default: { minMs: 900, maxMs: 100 } } })).toThrow(/minMs must not be more than maxMs/);
    expect(() => parse({ name: 'x', network: { preset: 'carrier-pigeon' as never } })).toThrow();
    expect(() => parse({ name: 'x', latency: { default: { fixedMs: 60_001 } } })).toThrow();
  });
});

describe('AC-LP-6 the plan for one request', () => {
  const none = { latency: undefined, network: undefined };

  it('AC-LP-6 draws a random delay inside the range, the same for the same request number', () => {
    const definition = { ...none, latency: { default: { minMs: 100, maxMs: 900 } } };
    const first = planNetwork({ definition, zeroed: false, rng: rng(7) });
    expect(first.delayMs).toBeGreaterThanOrEqual(100);
    expect(first.delayMs).toBeLessThanOrEqual(900);
    expect(first.delaySource).toBe('default');
    expect(planNetwork({ definition, zeroed: false, rng: rng(7) }).delayMs).toBe(first.delayMs);
    const seen = new Set(Array.from({ length: 40 }, (_, index) => planNetwork({ definition, zeroed: false, rng: rng(index + 1) }).delayMs));
    expect(seen.size).toBeGreaterThan(20);
    for (const delay of seen) {
      expect(delay).toBeGreaterThanOrEqual(100);
      expect(delay).toBeLessThanOrEqual(900);
    }
  });

  it('AC-LP-6 lets a scenario delay win over the endpoint, which wins over the backend and the preset', () => {
    const definition = { latency: { default: { fixedMs: 100 } }, network: { preset: '3g-slow' as const } };
    const at = (endpoint: object | undefined, scenario?: { delayMs?: number }) =>
      planNetwork({ definition, endpoint: endpoint as never, scenario, zeroed: false, rng: rng() });
    expect(at(undefined, { delayMs: 7 })).toMatchObject({ delayMs: 7, delaySource: 'scenario' });
    expect(at({ latency: { fixedMs: 50 } })).toMatchObject({ delayMs: 50, delaySource: 'endpoint' });
    expect(at({ latency: 'inherit' })).toMatchObject({ delayMs: 100, delaySource: 'default' });
    // Without any latency setting the preset's own latency applies.
    expect(planNetwork({ definition: { latency: undefined, network: { preset: '3g-slow' } }, zeroed: false, rng: rng() })).toMatchObject({ delayMs: 400, delaySource: 'preset' });
  });

  it('AC-LP-6 maps each preset to a latency and a throughput (Chrome DevTools profiles)', () => {
    expect(PRESET_PROFILES['3g-slow']).toEqual({ latencyMs: 400, downloadKbps: 500, uploadKbps: 500 });
    expect(PRESET_PROFILES['4g']).toEqual({ latencyMs: 60, downloadKbps: 9000, uploadKbps: 1500 });
    expect(PRESET_PROFILES.instant).toEqual({ latencyMs: 0 });
    const plan = (preset: 'wifi' | '4g' | '3g-slow' | 'instant') => planNetwork({ definition: { ...none, network: { preset } }, zeroed: false, rng: rng() });
    expect(plan('4g')).toMatchObject({ delayMs: 60, downloadKbps: 9000, uploadKbps: 1500 });
    expect(plan('wifi')).toMatchObject({ delayMs: 20, downloadKbps: 30_000 });
    expect(plan('instant')).toEqual({ delayMs: 0, delaySource: 'none', zeroed: false });
  });

  it('AC-LP-6 lets an endpoint replace the backend network, and a custom preset set its own numbers', () => {
    const definition = { ...none, network: { preset: '3g-slow' as const } };
    const endpoint = { network: { preset: 'custom' as const, downloadKbps: 123 } };
    expect(planNetwork({ definition, endpoint: endpoint as never, zeroed: false, rng: rng() })).toMatchObject({ delayMs: 0, downloadKbps: 123 });
    expect(planNetwork({ definition, endpoint: { network: { preset: 'instant' } } as never, zeroed: false, rng: rng() }).downloadKbps).toBeUndefined();
    expect(planNetwork({ definition, endpoint: { network: { preset: '4g', downloadKbps: 77 } } as never, zeroed: false, rng: rng() }).downloadKbps).toBe(77);
  });

  it('AC-LP-6 holds a timeout preset for its timeoutMs (30 s by default, at most 2 minutes)', () => {
    const at = (network: object) => planNetwork({ definition: { ...none, network: network as never }, zeroed: false, rng: rng() });
    expect(at({ preset: 'timeout' })).toMatchObject({ timeoutMs: 30_000, delaySource: 'timeout' });
    expect(at({ preset: 'timeout', timeoutMs: 250 })).toMatchObject({ timeoutMs: 250, delayMs: 250 });
    expect(at({ preset: 'timeout', timeoutMs: 9_000_000 }).timeoutMs).toBe(120_000);
  });

  it('AC-LP-6 zeroes everything in test mode', () => {
    const definition = { latency: { default: { fixedMs: 500 } }, network: { preset: 'timeout' as const } };
    expect(planNetwork({ definition, scenario: { delayMs: 900 }, zeroed: true, rng: rng() })).toEqual({ delayMs: 0, delaySource: 'none', zeroed: true });
  });
});

describe('AC-LP-6 test mode switches', () => {
  const headers = (value: Record<string, string>) => value;
  it('AC-LP-6 is on for the header, the engine option or the definition, and the opt-in header keeps the delays', () => {
    const base = { engine: false, definition: false };
    expect(testModeOf({ ...base, headers: headers({}) })).toEqual({ testMode: false, zeroed: false });
    expect(testModeOf({ ...base, headers: headers({ [TEST_MODE_HEADER]: '1' }) })).toEqual({ testMode: true, zeroed: true });
    expect(testModeOf({ ...base, headers: headers({ [TEST_MODE_HEADER]: '0' }) }).testMode).toBe(false);
    expect(testModeOf({ engine: true, definition: false, headers: headers({}) })).toEqual({ testMode: true, zeroed: true });
    expect(testModeOf({ engine: false, definition: true, headers: headers({}) })).toEqual({ testMode: true, zeroed: true });
    expect(testModeOf({ engine: true, definition: false, headers: headers({ [TEST_DELAYS_HEADER]: '1' }) })).toEqual({ testMode: true, zeroed: false });
    // A request opts out of engine-level and definition-level test mode (a CI session is in test mode by default).
    expect(testModeOf({ engine: true, definition: false, headers: headers({ [TEST_MODE_HEADER]: '0' }) })).toEqual({ testMode: false, zeroed: false });
    expect(testModeOf({ engine: false, definition: true, headers: headers({ [TEST_MODE_HEADER]: '0' }) }).testMode).toBe(false);
    // The opt-in alone does nothing: there is no test mode to opt out of.
    expect(testModeOf({ ...base, headers: headers({ [TEST_DELAYS_HEADER]: '1' }) })).toEqual({ testMode: false, zeroed: false });
  });
});

describe('AC-LP-6 throttling', () => {
  async function through(kbps: number, bytes: number): Promise<{ elapsed: number; marks: number[] }> {
    const stream = new ThrottleStream(kbps);
    const marks: number[] = [];
    const started = performance.now();
    let total = 0;
    stream.on('data', (chunk: Buffer) => {
      total += chunk.length;
      marks.push(performance.now() - started);
    });
    const done = new Promise<void>((resolve) => stream.on('end', resolve));
    stream.end(Buffer.alloc(bytes, 1));
    await vi.advanceTimersByTimeAsync(10_000);
    await done;
    expect(total).toBe(bytes);
    return { elapsed: marks.at(-1) ?? 0, marks };
  }

  it('AC-LP-6 releases a body at the set rate (fake timers, 10 % tolerance)', async () => {
    vi.useFakeTimers();
    // 80 kbps = 10,000 bytes per second.
    const { elapsed, marks } = await through(80, 20_000);
    expect(elapsed).toBeGreaterThan(1800);
    expect(elapsed).toBeLessThan(2200);
    expect(marks.length).toBeGreaterThan(5);
    const fast = await through(8000, 1_000_000);
    expect(fast.elapsed).toBeGreaterThan(900);
    expect(fast.elapsed).toBeLessThan(1100);
  });

  it('AC-LP-6 stops its timer when destroyed (the client went away)', async () => {
    vi.useFakeTimers();
    const stream = new ThrottleStream(8);
    stream.on('data', () => undefined);
    stream.on('error', () => undefined);
    stream.write(Buffer.alloc(100_000));
    await vi.advanceTimersByTimeAsync(50);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    stream.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('AC-LP-6 sleepFor ends at once when its signal aborts, and clears its timer', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let done = false;
    void sleepFor(60_000, controller.signal).then(() => (done = true));
    expect(vi.getTimerCount()).toBe(1);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});

const base = (extra: Partial<BackendInput> = {}): BackendInput => ({
  name: 'delays',
  endpoints: [
    { id: 'ping', type: 'static', method: 'GET', path: '/ping', body: { ok: true } },
    { id: 'echo', type: 'static', method: 'POST', path: '/echo', body: { got: true } },
    { id: 'big', type: 'static', method: 'GET', path: '/big', body: { text: 'x'.repeat(12_000) } },
  ],
  ...extra,
});

async function logged(backend: { engine: { requests: { snapshot(after?: number): { network?: unknown; status: number; url: string; ms: number }[] } } }) {
  return backend.engine.requests.snapshot();
}

describe('AC-LP-6 delays on a running backend', () => {
  it('AC-LP-6 waits a random delay from the range and the request log shows it', async () => {
    const { url, backend } = await serve(base({ latency: { default: { minMs: 150, maxMs: 400 } } }));
    const started = Date.now();
    const response = await fetch(`${url}/ping`);
    const took = Date.now() - started;
    expect(response.status).toBe(200);
    const [entry] = await logged(backend);
    const note = entry?.network as { delayMs: number; delaySource: string };
    expect(note.delaySource).toBe('default');
    expect(note.delayMs).toBeGreaterThanOrEqual(150);
    expect(note.delayMs).toBeLessThanOrEqual(400);
    expect(took).toBeGreaterThanOrEqual(note.delayMs - 15);
  });

  it('AC-LP-6 repeats the same delays for the same seed', async () => {
    const delays = async (): Promise<number[]> => {
      const { url, backend } = await serve(base({ latency: { default: { minMs: 1, maxMs: 40 } } }), { seed: 'fixed' });
      for (let i = 0; i < 4; i += 1) await fetch(`${url}/ping`);
      return (await logged(backend)).map((entry) => (entry.network as { delayMs: number }).delayMs);
    };
    expect(await delays()).toEqual(await delays());
  });

  it('AC-LP-6 uses an endpoint delay over the backend one, and a scenario delay over both', async () => {
    const definition = base({ latency: { default: { fixedMs: 300 } } });
    definition.endpoints = [
      { id: 'fast', type: 'static', method: 'GET', path: '/fast', body: {}, latency: { fixedMs: 5 }, scenarios: { slow: { delayMs: 120 } } },
      { id: 'inherits', type: 'static', method: 'GET', path: '/inherits', body: {}, latency: 'inherit' },
    ];
    const { url, backend } = await serve(definition);
    await fetch(`${url}/fast`);
    await fetch(`${url}/fast`, { headers: { 'x-tempo-scenario': 'slow' } });
    await fetch(`${url}/inherits`);
    const notes = (await logged(backend)).map((entry) => entry.network as { delayMs: number; delaySource: string });
    expect(notes.map((note) => [note.delayMs, note.delaySource])).toEqual([[5, 'endpoint'], [120, 'scenario'], [300, 'default']]);
  });

  it('AC-LP-6 throttles a download to the preset rate and records it', async () => {
    // 12 kB at 400 kbps (50 kB/s) is about 240 ms.
    const { url, backend } = await serve(base({ network: { preset: 'custom', downloadKbps: 400 } }));
    const started = Date.now();
    const response = await fetch(`${url}/big`);
    const text = await response.text();
    const took = Date.now() - started;
    expect(text.length).toBeGreaterThan(12_000);
    expect(took).toBeGreaterThanOrEqual(200);
    expect(took).toBeLessThan(2500);
    expect(((await logged(backend))[0]?.network as { downloadKbps: number }).downloadKbps).toBe(400);
  });

  it('AC-LP-6 throttles a request body while it is read', async () => {
    // 20 kB at 400 kbps (50 kB/s) is 400 ms.
    const { url } = await serve(base({ network: { preset: 'custom', uploadKbps: 400 } }));
    const started = Date.now();
    const response = await fetch(`${url}/echo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pad: 'y'.repeat(20_000) }) });
    expect(response.status).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(330);
  });

  it('AC-LP-6 closes the connection without an answer on the timeout preset, and logs it', async () => {
    const { url, backend } = await serve(base({ network: { preset: 'timeout', timeoutMs: 300 } }));
    const started = Date.now();
    await expect(fetch(`${url}/ping`)).rejects.toThrow();
    expect(Date.now() - started).toBeGreaterThanOrEqual(270);
    const [entry] = await logged(backend);
    expect(entry).toMatchObject({ status: 0, network: { timedOut: true, delayMs: 300, delaySource: 'timeout' } });
    expect(backend.engine.stats.snapshot().errors).toBe(1);
  });

  it('AC-LP-6 stops waiting at once when the client disconnects', async () => {
    const { url, backend } = await serve(base({ network: { preset: 'timeout', timeoutMs: 60_000 } }));
    const controller = new AbortController();
    const pending = fetch(`${url}/ping`, { signal: controller.signal }).catch(() => undefined);
    await new Promise((done) => setTimeout(done, 120));
    controller.abort();
    await pending;
    await vi.waitFor(() => expect(backend.engine.requests.snapshot()).toHaveLength(1), { timeout: 2000 });
    expect(backend.engine.requests.snapshot()[0]).toMatchObject({ status: 499 });
  });

  it('AC-LP-6 test mode (header) answers at once, and the opt-in header brings the delay back', async () => {
    const { url } = await serve(base({ latency: { default: { fixedMs: 250 } } }));
    let started = Date.now();
    await fetch(`${url}/ping`, { headers: { [TEST_MODE_HEADER]: '1' } });
    expect(Date.now() - started).toBeLessThan(150);
    started = Date.now();
    await fetch(`${url}/ping`, { headers: { [TEST_MODE_HEADER]: '1', [TEST_DELAYS_HEADER]: '1' } });
    expect(Date.now() - started).toBeGreaterThanOrEqual(230);
  });

  it('AC-LP-6 test mode (engine option and the definition) zeroes delays, throttling and timeouts', async () => {
    for (const [definition, options] of [
      [base({ network: { preset: 'timeout', timeoutMs: 5000 }, latency: { default: { fixedMs: 500 } } }), { testMode: true }],
      [base({ network: { preset: 'timeout', timeoutMs: 5000 }, testMode: true }), {}],
    ] as const) {
      const { url, backend } = await serve(definition, options);
      const started = Date.now();
      const response = await fetch(`${url}/big`);
      expect(response.status).toBe(200);
      expect(Date.now() - started).toBeLessThan(400);
      expect((await logged(backend))[0]?.network).toEqual({ testMode: true });
    }
  });
});

describe('AC-LP-6 a client that leaves mid-throttle', () => {
  it('AC-LP-6 does not keep the server busy until the slow body would have finished', async () => {
    // 12 kB at 8 kbps would take 12 s.
    const { url, backend } = await serve(base({ network: { preset: 'custom', downloadKbps: 8 } }));
    const controller = new AbortController();
    const response = await fetch(`${url}/big`, { signal: controller.signal });
    await response.body?.getReader().read();
    controller.abort();
    const started = Date.now();
    await backend.stop();
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('AC-LP-6 the network and delay settings page', () => {
  it('AC-LP-6 PUT /settings/network needs the admin role and is audited', async () => {
    const site = await startSite();
    const editor = await member(site, 'ed@example.com', 'editor');
    const viewer = await member(site, 'view@example.com', 'viewer');
    const admin = await member(site, 'adm@example.com', 'admin');
    const next = { network: { preset: '4g' }, latency: { default: { minMs: 10, maxMs: 20 } }, testMode: false };
    expect((await editor.admin('demo', 'PUT', '/settings/network', next)).status).toBe(403);
    expect((await viewer.admin('demo', 'PUT', '/settings/network', next)).status).toBe(403);
    expect((await viewer.admin('demo', 'GET', '/settings/network')).status).toBe(200);
    const saved = await admin.admin('demo', 'PUT', '/settings/network', next);
    expect(saved.status, saved.body).toBe(200);
    expect(saved.json()).toEqual(next);
    expect((await viewer.admin('demo', 'GET', '/settings/network')).json()).toEqual(next);
    const log = await site.owner.hub('GET', '/backends/demo/audit?action=PUT');
    const entries = (log.json() as { entries: { actor: { label: string }; action: string; denied: boolean; status: number; summary: { after?: unknown } | null }[] }).entries;
    expect(entries.filter((entry) => entry.action === 'PUT /settings/network').map((entry) => [entry.actor.label, entry.denied, entry.status])).toEqual(
      expect.arrayContaining([['adm@example.com', false, 200], ['ed@example.com', true, 403]]),
    );
    expect(entries.find((entry) => entry.status === 200)?.summary?.after).toEqual(next);
  });

  it('AC-LP-6 an editor cannot change delays through PUT /definition either', async () => {
    const site = await startSite();
    const editor = await member(site, 'ed@example.com', 'editor');
    const definition = (await editor.admin('demo', 'GET', '/definition')).json();
    const changed = await editor.admin('demo', 'PUT', '/definition', { ...definition, latency: { default: { fixedMs: 50 } } });
    expect(changed.status).toBe(403);
    expect(changed.body).toContain('delays');
    // An endpoint of their own may carry a delay: that is content.
    const endpoints = (definition as { endpoints: { id: string }[] }).endpoints.map((endpoint, index) => (index === 0 ? { ...endpoint, latency: { fixedMs: 5 } } : endpoint));
    expect((await editor.admin('demo', 'PUT', '/definition', { ...definition, endpoints })).status).toBe(200);
  });

  it('AC-LP-6 rejects keys that do not belong to the page and invalid values', async () => {
    const site = await startSite();
    expect((await site.owner.admin('demo', 'PUT', '/settings/network', { port: 1 })).status).toBe(400);
    const bad = await site.owner.admin('demo', 'PUT', '/settings/network', { latency: { default: { minMs: 9, maxMs: 1 } } });
    expect(bad.status).toBe(400);
    expect(bad.body).toContain('minMs');
  });
});
