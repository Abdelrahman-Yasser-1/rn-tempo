// The orchestrating test says where the definition must come from (a folder, a download, the cache after the server is gone).
it('loaded the definition from the expected place', () => {
  if (process.env.EXPECT_LOADED === undefined) return;
  // A `|` list allows several answers: with parallel workers, whichever file runs first downloads the
  // definition and the others get "not modified" from the same server.
  expect(process.env.EXPECT_LOADED.split('|')).toContain(globalThis.tempoBackend.loaded);
});

it('starts on a random loopback port over http', () => {
  expect(globalThis.tempoBackend.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
});

it('reports how long the engine took to start', () => {
  const ms = globalThis.tempoBackend.startMs;
  expect(typeof ms).toBe('number');
  if (process.env.TEMPO_TIMING_FILE !== undefined) require('node:fs').appendFileSync(process.env.TEMPO_TIMING_FILE, `${String(Math.round(ms))}\n`);
});
