import { describe, expect, it } from 'vitest';

import { openApiPath } from '../src/shared/json.ts';
import { createLogger } from '../src/shared/logger.ts';
import { endpointId, problem } from '../src/shared/problem.ts';
import { REDACTED, redactDeep } from '../src/shared/redact.ts';
import { MAX_BODY_CHARS, RequestLog, RING_SIZE, viewBody } from '../src/shared/request-log.ts';

describe('redact', () => {
  it('replaces sensitive keys at any depth', () => {
    expect(redactDeep({ password: 'x', a: 1 })).toEqual({ password: REDACTED, a: 1 });
    expect(redactDeep({ list: [{ refreshToken: 'r' }] })).toEqual({ list: [{ refreshToken: REDACTED }] });
  });

  it('formats an OpenAPI path', () => {
    expect(openApiPath('/p/:id')).toBe('/p/{id}');
  });
});

describe('endpointId and problem', () => {
  it('normalizes method and path', () => {
    expect(endpointId('GET', '/products/:id')).toBe('get.products.:id');
    expect(endpointId('POST', '/auth/login/')).toBe('post.auth.login');
  });

  it('builds problem details with a default title', () => {
    expect(problem(404, { detail: 'gone' })).toEqual({ type: 'about:blank', title: 'Not Found', status: 404, detail: 'gone' });
    expect(problem(418).title).toBe('Error');
  });
});

describe('request log entries', () => {
  it('redacts passwords, tokens and secret query values, and keeps the shape', () => {
    const log = new RequestLog();
    const entry = log.record({
      method: 'POST',
      url: '/auth/login',
      status: 200,
      ms: 4,
      scenario: 'slow',
      reqHeaders: { authorization: 'Bearer hunter2', 'x-tempo-token': 'ctl', accept: 'json' },
      reqBody: { username: 'emilys', password: 'emilyspass', nested: { refreshToken: 'r' } },
      resBody: { accessToken: 'abc', id: 1 },
    });
    const text = JSON.stringify(entry);
    for (const secret of ['hunter2', 'emilyspass', '"abc"', '"ctl"', '"r"']) expect(text).not.toContain(secret);
    expect(entry).toMatchObject({ id: 1, method: 'POST', status: 200, ms: 4, scenario: 'slow' });
    expect(entry.req.headers).toMatchObject({ accept: 'json', authorization: '[REDACTED]' });
    expect(entry.res.body).toEqual({ accessToken: '[REDACTED]', id: 1 });
  });

  it('cuts a big body and marks it truncated', () => {
    const view = viewBody({ text: 'x'.repeat(MAX_BODY_CHARS * 2) });
    expect(view.truncated).toBe(true);
    expect(typeof view.body).toBe('string');
    expect((view.body as string).length).toBe(MAX_BODY_CHARS);
    expect(viewBody({ small: 1 })).toEqual({ body: { small: 1 } });
  });

  it('keeps only the last RING_SIZE entries, oldest dropped, ids still counting up', () => {
    const log = new RequestLog();
    for (let i = 0; i < RING_SIZE + 25; i++) log.record({ method: 'GET', url: `/n/${i}`, status: 200, ms: 1, reqHeaders: {}, reqBody: undefined, resBody: undefined });
    const kept = log.snapshot();
    expect(kept).toHaveLength(RING_SIZE);
    expect(kept[0]?.id).toBe(26);
    expect(kept.at(-1)?.id).toBe(RING_SIZE + 25);
    expect(log.snapshot(RING_SIZE + 20).map((e) => e.id)).toEqual([RING_SIZE + 21, RING_SIZE + 22, RING_SIZE + 23, RING_SIZE + 24, RING_SIZE + 25]);
  });
});

describe('createLogger', () => {
  it('redacts secrets in logged objects', () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'debug', destination: { write: (chunk: string) => void lines.push(chunk) } });
    logger.info({ password: 'emilyspass', token: 'tok-secret', user: 'emilys' }, 'hello');
    const text = lines.join('');
    expect(text).not.toContain('emilyspass');
    expect(text).not.toContain('tok-secret');
    expect(text).toContain('[REDACTED]');
    expect(text).toContain('"user":"emilys"');
  });
});
