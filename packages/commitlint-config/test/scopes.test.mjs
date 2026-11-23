import { describe, expect, it } from 'vitest';
import config, { createConfig, SCOPES } from '../index.mjs';

describe('scopes', () => {
  it('includes the backend scopes', () => {
    for (const scope of ['api', 'portal', 'backend', 'docker']) {
      expect(SCOPES).toContain(scope);
    }
  });

  it('has no duplicate scopes', () => {
    expect(new Set(SCOPES).size).toBe(SCOPES.length);
  });

  it('puts the shared scopes in the scope-enum rule', () => {
    expect(config.rules['scope-enum'][2]).toEqual(SCOPES);
  });

  it('appends project scopes', () => {
    const scopes = createConfig({ extraScopes: ['wallet'] }).rules['scope-enum'][2];
    expect(scopes).toContain('wallet');
    expect(scopes).toContain('backend');
  });
});
