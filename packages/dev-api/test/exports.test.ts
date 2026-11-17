import { describe, expect, it } from 'vitest';

import * as api from '../src/index.ts';

describe('shared exports', () => {
  it('exposes the pieces the local backend engine reuses', () => {
    for (const name of ['redactDeep', 'redactUrl', 'RequestLog', 'swaggerDir', 'sortKeys', 'openApiPath', 'createCerts', 'realRunner', 'lanAddress', 'createLogger']) {
      expect(api).toHaveProperty(name);
    }
    expect(api.CERT_FILE).toBe('cert.pem');
    expect(api.openApiPath('/p/:id')).toBe('/p/{id}');
    expect(api.redactDeep({ password: 'x', a: 1 })).toEqual({ password: api.REDACTED, a: 1 });
  });
});
