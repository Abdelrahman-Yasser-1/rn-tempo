import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import rule from './ai-session-trailer.mjs';

const cwd = mkdtempSync(path.join(tmpdir(), 'commitlint-ai-'));
mkdirSync(path.join(cwd, '.ai/sessions'), { recursive: true });
writeFileSync(path.join(cwd, '.ai/sessions/s1.md'), '---\n---\n');

const check = (raw) => rule({ raw }, 'always', undefined, cwd);

describe('ai-session-trailer', () => {
  it('passes commits without AI trailers', () => {
    expect(check('feat(app): add thing\n')).toEqual([true]);
  });

  it('passes AI commits with an existing session', () => {
    expect(check('feat(app): x\n\nAI-Assisted: claude-code/m\nAI-Session: .ai/sessions/s1.md\n')).toEqual([true]);
  });

  it('fails AI-Assisted without AI-Session', () => {
    expect(check('feat(app): x\n\nAI-Assisted: claude-code/m\n')[0]).toBe(false);
  });

  it('fails AI-Session without AI-Assisted', () => {
    expect(check('feat(app): x\n\nAI-Session: .ai/sessions/s1.md\n')[0]).toBe(false);
  });

  it('fails a malformed session path', () => {
    expect(check('feat(app): x\n\nAI-Assisted: t/m\nAI-Session: notes/s1.md\n')[0]).toBe(false);
  });

  it('fails a missing session file', () => {
    expect(check('feat(app): x\n\nAI-Assisted: t/m\nAI-Session: .ai/sessions/missing.md\n')[0]).toBe(false);
  });

  it('is disabled with "never"', () => {
    expect(rule({ raw: 'AI-Assisted: t/m' }, 'never')).toEqual([true]);
  });
});
