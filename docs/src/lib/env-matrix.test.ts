import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMatrix, readTempoJson } from './env-matrix';

describe('buildMatrix', () => {
  const matrix = buildMatrix(readTempoJson(path.resolve(__dirname, '../../..')));
  const row = (key: string) => matrix.rows.find((r) => r.key === key)?.values;

  it('lists dev, staging and prod from the real .tempo.json', () => {
    expect(matrix.envs).toEqual(['dev', 'staging', 'prod']);
  });

  it('derives bundle ids, schemes and prod specials', () => {
    expect(row('Bundle ID')).toEqual([
      'com.rntempo.app.dev',
      'com.rntempo.app.staging',
      'com.rntempo.app',
    ]);
    expect(row('iOS scheme')).toEqual(['TempoApp-Dev', 'TempoApp-Staging', 'TempoApp-Prod']);
    expect(row('iOS AppIcon set')).toEqual(['AppIcon-Dev', 'AppIcon-Staging', 'AppIcon']);
    expect(row('`applicationIdSuffix`')?.[2]).toBe('(none)');
  });
});
