const axios = require('axios');
const { setupTempoBackend } = require('@rn-tempo/local-backend/test');

// One line of setup. `TEMPO_BACKEND` is a backend folder or https://<server>/b/<name>; `TEMPO_BACKEND_KEY` is a read-definition key.
globalThis.tempoBackend = setupTempoBackend({
  source: process.env.TEMPO_BACKEND,
  apiKey: process.env.TEMPO_BACKEND_KEY,
  cacheDir: process.env.TEMPO_CACHE_DIR,
  isolate: process.env.TEMPO_ISOLATE === 'test' ? 'test' : 'file',
});

// The app's HTTP client: its base URL is read lazily, after the kit's beforeAll has started the backend.
globalThis.api = axios.create({ validateStatus: () => true });
beforeAll(() => {
  globalThis.api.defaults.baseURL = globalThis.tempoBackend.url;
});
