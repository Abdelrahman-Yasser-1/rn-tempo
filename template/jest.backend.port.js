const { execFileSync } = require('node:child_process');

/**
 * The port of this test file's backend, picked once per file (the cache lives on globalThis, which jest.resetModules keeps).
 * Modules read API_BASE_URL when they are imported, which is before the backend has started, so the address has to be
 * known up front: __mocks__/react-native-config.js builds the URL from this port and jest.backend.setup.js starts the
 * backend on it.
 */
function backendPort() {
  if (globalThis.tempoTestBackendPort === undefined) {
    const script =
      "const s=require('node:net').createServer().listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close()})";
    globalThis.tempoTestBackendPort = Number(
      execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' }),
    );
  }
  return globalThis.tempoTestBackendPort;
}

module.exports = { backendPort };
