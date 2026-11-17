import { describe, expect, it } from 'vitest';

import { parseLogs } from './logs';

describe('parseLogs', () => {
  const ok = { code: 0, stdout: '10:00:00 INFO  request GET /a 200 3ms\n\n10:00:01 WARN  slow\n', stderr: '' };

  it('splits lines and drops blanks', () => {
    expect(parseLogs(ok, '').lines).toEqual(['10:00:00 INFO  request GET /a 200 3ms', '10:00:01 WARN  slow']);
  });

  it('filters case-insensitively', () => {
    expect(parseLogs(ok, 'WARN').lines).toEqual(['10:00:01 WARN  slow']);
  });

  it('turns the CLI complaint into a notice', () => {
    const view = parseLogs({ code: 1, stdout: '', stderr: 'tempo-api: No log yet (/x/server.log). Start the server with `up`.\n' }, '');
    expect(view.lines).toEqual([]);
    expect(view.notice).toContain('No log yet');
    expect(view.notice).not.toContain('tempo-api:');
  });
});
