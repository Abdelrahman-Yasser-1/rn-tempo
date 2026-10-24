import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

const require = createRequire(import.meta.url);

function load(file) {
  const path = require.resolve(file);
  const read = ts.readConfigFile(path, ts.sys.readFile);
  expect(read.error).toBeUndefined();
  return ts.parseJsonConfigFileContent(read.config, ts.sys, '.', undefined, path);
}

describe('tsconfig presets', () => {
  it('base.json enables the strict flags', () => {
    const { options, errors } = load('../base.json');
    expect(errors.filter((e) => e.code !== 18003)).toEqual([]);
    expect(options.strict).toBe(true);
    expect(options.noUncheckedIndexedAccess).toBe(true);
    expect(options.noImplicitOverride).toBe(true);
    expect(options.noFallthroughCasesInSwitch).toBe(true);
  });

  it('react-native.json inherits base and the React Native preset', () => {
    const { options } = load('../react-native.json');
    expect(options.noUncheckedIndexedAccess).toBe(true);
    expect(options.jsx).toBe(ts.JsxEmit.ReactNative);
  });
});
