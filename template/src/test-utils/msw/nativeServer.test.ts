import { ENV } from '@config/env';

import { startNativeMocking, stopNativeMocking } from './nativeServer';
import { server } from './server';

describe('nativeServer (dev mock mode)', () => {
  beforeEach(() => {
    // Only one interceptor stack may own fetch at a time.
    server.close();
  });

  afterEach(() => {
    stopNativeMocking();
    server.listen({ onUnhandledFrame: 'error' });
  });

  test('AC-9: serves the shared auth handlers for fetch', async () => {
    startNativeMocking();

    const response = await fetch(`${ENV.API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'emilys', password: 'emilyspass' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ username: 'emilys' });
  });

  test('start and stop are idempotent', () => {
    startNativeMocking();
    startNativeMocking();
    stopNativeMocking();

    expect(() => {
      stopNativeMocking();
    }).not.toThrow();
  });
});
