import { describe, expect, it } from 'vitest';

import { readSwaggerAsset, swaggerAssetKey, type AssetSources } from '../src/assets.ts';

const bytes = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer;

describe('readSwaggerAsset', () => {
  it('reads from the executable when running as one', () => {
    const asked: string[] = [];
    const sources: AssetSources = {
      isSea: () => true,
      getAsset: (key) => {
        asked.push(key);
        return bytes('from the blob');
      },
      fromDisk: () => {
        throw new Error('must not touch the disk');
      },
    };
    expect(readSwaggerAsset('swagger-ui.css', sources).toString('utf8')).toBe('from the blob');
    expect(asked).toEqual(['swagger-ui/swagger-ui.css']);
    expect(swaggerAssetKey('x.js')).toBe('swagger-ui/x.js');
  });

  it('reads from disk otherwise', () => {
    const sources: AssetSources = {
      isSea: () => false,
      getAsset: () => {
        throw new Error('no blob here');
      },
      fromDisk: (name) => Buffer.from(`disk:${name}`),
    };
    expect(readSwaggerAsset('swagger-ui-bundle.js', sources).toString('utf8')).toBe('disk:swagger-ui-bundle.js');
  });

  it('finds the real Swagger UI files when not a single executable', () => {
    expect(readSwaggerAsset('swagger-ui.css').length).toBeGreaterThan(1000);
  });
});
