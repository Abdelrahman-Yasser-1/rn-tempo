const { performance } = require('node:perf_hooks');

const backend = globalThis.tempoBackend;
const api = globalThis.api;

describe('products against the Tempo backend', () => {
  it('lists the seeded products over real HTTP', async () => {
    const res = await api.get('/products?limit=5');
    expect(res.status).toBe(200);
    expect(res.data.products).toHaveLength(5);
    expect(res.data.total).toBe(100);
  });

  it('creates a product, and a reset brings the seed back', async () => {
    const created = await api.post('/products', { title: 'Made in a test', price: 3 });
    expect(created.status).toBe(201);
    expect(backend.data.list('products')).toHaveLength(101);
    backend.reset();
    expect((await api.get('/products?limit=1')).data.total).toBe(100);
  });

  it('inserts through backend.data and reads it over HTTP', async () => {
    const row = backend.data.insert('products', { title: 'Inserted', price: 1 });
    const res = await api.get(`/products/${row.id}`);
    expect(res.data.title).toBe('Inserted');
    backend.reset();
  });

  it('switches a scenario and clears it', async () => {
    backend.scenario('products.get', '404 notFound');
    expect((await api.get('/products/1')).status).toBe(404);
    backend.clearScenarios();
    expect((await api.get('/products/1')).status).toBe(200);
  });

  it('runs in test mode: no delay although the backend says 2 s', async () => {
    const started = performance.now();
    const res = await api.get('/products/1');
    const took = performance.now() - started;
    expect(res.status).toBe(200);
    expect(took).toBeLessThan(500);
  });

  it('opts in to the configured delay with a header', async () => {
    const started = performance.now();
    await api.get('/products/1', { headers: { 'x-tempo-test-delays': '1' } });
    expect(performance.now() - started).toBeGreaterThanOrEqual(1900);
  });

  it('records the requests, with the token redacted', async () => {
    backend.reset();
    await api.get('/products/2', { headers: { authorization: 'Bearer secret-token-value' } });
    const [entry] = backend.requests();
    expect(entry.method).toBe('GET');
    expect(entry.url).toBe('/products/2');
    expect(entry.status).toBe(200);
    expect(JSON.stringify(entry)).not.toContain('secret-token-value');
  });
});
