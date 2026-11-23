const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { backendPort } = require('../jest.backend.port');

// Parses the committed `.env.dev` so tests see the same values as the dev flavor (API_BASE_URL is replaced below).
function parseEnvFile(path) {
  const values = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator > 0) {
      values[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
    }
  }
  return values;
}

const values = parseEnvFile(join(__dirname, '..', '.env.dev'));
// The suite runs against a Tempo local backend that jest.backend.setup.js starts on this port.
values.API_BASE_URL = `http://127.0.0.1:${backendPort()}`;

module.exports = { __esModule: true, default: values };
