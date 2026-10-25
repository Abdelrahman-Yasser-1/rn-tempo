const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Parses the committed `.env.dev` so tests see the same values as the dev flavor.
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

module.exports = { __esModule: true, default: parseEnvFile(join(__dirname, '..', '.env.dev')) };
