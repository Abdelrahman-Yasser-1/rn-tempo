import { ENV } from '@config/env';

import { MOCK_ACCESS_TOKEN, MOCK_REFRESH_TOKEN } from './auth';

const base = ENV.API_BASE_URL;
const json = { 'content-type': 'application/json' };

async function call(path: string, init?: RequestInit) {
  const response = await fetch(`${base}${path}`, init);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('default mock handlers', () => {
  test('login succeeds for emilys/emilyspass and returns tokens plus the user', async () => {
    const { status, body } = await call('/auth/login', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ username: 'emilys', password: 'emilyspass' }),
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      username: 'emilys',
      accessToken: MOCK_ACCESS_TOKEN,
      refreshToken: MOCK_REFRESH_TOKEN,
    });
  });

  test('login rejects bad credentials with 400', async () => {
    const { status, body } = await call('/auth/login', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ username: 'emilys', password: 'nope' }),
    });

    expect(status).toBe(400);
    expect(body.message).toBe('Invalid credentials');
  });

  test('refresh issues tokens for the mock refresh token only', async () => {
    const ok = await call('/auth/refresh', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ refreshToken: MOCK_REFRESH_TOKEN }),
    });
    const bad = await call('/auth/refresh', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ refreshToken: 'other' }),
    });

    expect(ok.status).toBe(200);
    expect(bad.status).toBe(401);
  });

  test('me requires the mock bearer token', async () => {
    const ok = await call('/auth/me', {
      headers: { authorization: `Bearer ${MOCK_ACCESS_TOKEN}` },
    });
    const anonymous = await call('/auth/me');

    expect(ok).toMatchObject({ status: 200, body: { username: 'emilys' } });
    expect(anonymous.status).toBe(401);
  });

  test('app-config returns a non-blocking config', async () => {
    const { status, body } = await call(ENV.APP_CONFIG_PATH);

    expect(status).toBe(200);
    expect(body).toMatchObject({ maintenance: { enabled: false } });
  });

  test('handlers match any host so the debug URL override keeps working', async () => {
    const response = await fetch('https://staging.example.test/app-config');

    expect(response.status).toBe(200);
  });
});
