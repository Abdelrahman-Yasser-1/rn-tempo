import { describe, expect, it } from 'vitest';

import { assertInsideProject, globToRegExp } from '../src/lib/fs-utils.ts';

describe('globToRegExp', () => {
  it('matches a directory and everything below for dir/**', () => {
    const re = globToRegExp('src/services/security/pinning/**');
    expect(re.test('src/services/security/pinning')).toBe(true);
    expect(re.test('src/services/security/pinning/a/b.ts')).toBe(true);
    expect(re.test('src/services/security/pinning2/a.ts')).toBe(false);
  });

  it('supports ** between segments, single * and braces', () => {
    expect(globToRegExp('src/**/*.stories.tsx').test('src/shared/components/Button/Button.stories.tsx')).toBe(true);
    expect(globToRegExp('src/**/*.stories.tsx').test('src/Button.stories.tsx')).toBe(true);
    expect(globToRegExp('src/locales/*/forms.json').test('src/locales/en/forms.json')).toBe(true);
    expect(globToRegExp('src/locales/*/forms.json').test('src/locales/en/x/forms.json')).toBe(false);
    expect(globToRegExp('e2e/flows/items-*.yaml').test('e2e/flows/items-list.yaml')).toBe(true);
    expect(globToRegExp('a.{ts,tsx}').test('a.tsx')).toBe(true);
  });

  it('escapes regex metacharacters in literals', () => {
    expect(globToRegExp('.claude/**').test('.claude/settings.json')).toBe(true);
    expect(globToRegExp('CLAUDE.md').test('CLAUDEXmd')).toBe(false);
  });
});

describe('assertInsideProject', () => {
  it.each(['/etc/passwd', '../x', '..\\x', 'a/../../x', 'C:\\x', 'C:/x', '\\\\server\\share', '//server/share', ''])(
    'rejects %j',
    (value) => {
      expect(() => assertInsideProject(value, 'glob')).toThrow(/inside the project/);
    },
  );

  it.each(['src/x', 'src/a/../b', 'e2e/flows/items-*.yaml', '.claude/**'])('accepts %j', (value) => {
    expect(() => assertInsideProject(value, 'glob')).not.toThrow();
  });
});
