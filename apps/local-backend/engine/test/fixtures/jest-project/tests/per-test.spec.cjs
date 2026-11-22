// With `isolate: 'test'` (TEMPO_ISOLATE=test) every test starts from the seed; with the default, the rows of a test stay for the next.
const backend = globalThis.tempoBackend;
const api = globalThis.api;
const perTest = process.env.TEMPO_ISOLATE === 'test';

it('creates a row', async () => {
  expect((await api.post('/products', { title: 'Left behind', price: 1 })).status).toBe(201);
});

it(perTest ? 'starts the next test from the seed' : 'keeps the rows of the previous test', async () => {
  expect(backend.data.list('products')).toHaveLength(perTest ? 100 : 101);
});
