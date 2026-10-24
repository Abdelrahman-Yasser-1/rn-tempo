import { describe, expect, it } from 'vitest';
import prettier from 'prettier';
import config from '../index.mjs';

describe('prettier-config', () => {
  it('exposes the contract options', () => {
    expect(config).toEqual({
      singleQuote: true,
      trailingComma: 'all',
      printWidth: 100,
      semi: true,
      arrowParens: 'always',
      bracketSpacing: true,
    });
  });

  it('formats with single quotes, trailing commas and parenthesised arrows', async () => {
    const out = await prettier.format('const f = x => ({ a: "b" })\n', {
      ...config,
      parser: 'typescript',
    });
    expect(out).toBe("const f = (x) => ({ a: 'b' });\n");
  });
});
