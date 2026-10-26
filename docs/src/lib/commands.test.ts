import { describe, expect, it } from 'vitest';
import { toNpm } from './commands';

describe('toNpm', () => {
  it('maps install, add, remove and dlx', () => {
    expect(toNpm('install')).toBe('npm install');
    expect(toNpm('add zod')).toBe('npm install zod');
    expect(toNpm('remove zod')).toBe('npm uninstall zod');
    expect(toNpm('dlx create-tempo-app Demo')).toBe('npx create-tempo-app Demo');
  });

  it('runs anything else as an npm script', () => {
    expect(toNpm('android:dev')).toBe('npm run android:dev');
    expect(toNpm('verify --fix')).toBe('npm run verify -- --fix');
  });
});
