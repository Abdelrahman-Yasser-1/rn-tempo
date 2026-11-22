// Two files write to the same backend definition at the same time (Jest runs them in separate workers or one after the other);
// each must see only its own rows.
const backend = globalThis.tempoBackend;
const api = globalThis.api;

it('creates a product that no other test file sees', async () => {
  expect((await api.get('/products?limit=1')).data.total).toBe(100);
  expect((await api.post('/products', { title: 'Only in file B', price: 1 })).status).toBe(201);
  expect(backend.data.list('products')).toHaveLength(101);
});
