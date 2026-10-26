import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { getSection, parseSession, readCurrent, serializeSession, setSection } from '../lib.mjs';
import { REDACTED, redact } from '../redact.mjs';
import { appendPrompt, formatPrompt, startSession, stopSession, trailersFor } from '../session.mjs';

// Built at runtime so secret scanners don't flag the test fixture itself.
const FAKE_AWS_KEY = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');

const here = path.dirname(fileURLToPath(import.meta.url));
const sh = (cwd, cmd, args) => execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();

function tempRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ai-log-'));
  sh(dir, 'git', ['init', '-q', '-b', 'main']);
  sh(dir, 'git', ['config', 'user.name', 'Test User']);
  sh(dir, 'git', ['config', 'user.email', 'test@example.com']);
  sh(dir, 'git', ['commit', '-q', '--allow-empty', '-m', 'chore(repo): init']);
  process.env.AI_LOG_ROOT = dir;
  return dir;
}

describe('redact', () => {
  it('masks tokens, keys and emails', () => {
    const input = [
      'token=abc123',
      'Authorization: Bearer xyz.abc',
      'jwt eyJhbGciOi.eyJzdWIiOi.SflKxwRJSM',
      `aws ${FAKE_AWS_KEY}`,
      'mail me at jane.doe@acme.io',
      'api_key: sk-abcdefghijklmnopqrstuvwxyz',
    ].join('\n');
    const out = redact(input);
    assert.match(out, /token=\[REDACTED\]/);
    for (const secret of [
      'abc123',
      'xyz.abc',
      'eyJhbGciOi',
      FAKE_AWS_KEY,
      'jane.doe@acme.io',
      'sk-abcdef',
    ]) {
      assert.ok(!out.includes(secret), `leaked ${secret}`);
    }
  });

  it('masks private key blocks and applies extra patterns', () => {
    const key = '-----BEGIN RSA PRIVATE KEY-----\nMIIE\nabc\n-----END RSA PRIVATE KEY-----';
    assert.equal(redact(key), REDACTED);
    assert.equal(
      redact('host internal.acme.local', [/internal\.acme\.local/g]),
      `host ${REDACTED}`,
    );
  });

  it('leaves ordinary text alone', () => {
    assert.equal(
      redact('Add OTP resend countdown to the login screen'),
      'Add OTP resend countdown to the login screen',
    );
  });
});

describe('session document', () => {
  it('round-trips frontmatter', () => {
    const doc = {
      meta: {
        id: 'x',
        tool: 'claude-code',
        model: 'm',
        spec: null,
        commits: ['a1', 'b2'],
        files: [],
      },
      body: '\n## Prompts\n',
    };
    const parsed = parseSession(serializeSession(doc));
    assert.equal(parsed.meta.tool, 'claude-code');
    assert.equal(parsed.meta.spec, null);
    assert.deepEqual(parsed.meta.commits, ['a1', 'b2']);
  });

  it('replaces a section without touching the others', () => {
    let body = '\n## Prompts\none\n\n## Summary\nold\n\n## Follow-ups\n- keep\n';
    body = setSection(body, 'Summary', 'new');
    assert.equal(getSection(body, 'Summary'), 'new');
    assert.equal(getSection(body, 'Prompts'), 'one');
    assert.equal(getSection(body, 'Follow-ups'), '- keep');
  });
});

describe('prompt modes', () => {
  const long = 'x'.repeat(200);
  it('full keeps the whole redacted prompt', () =>
    assert.equal(formatPrompt(long, 'full', []), long));
  it('summary truncates to 140 chars', () =>
    assert.equal(formatPrompt(long, 'summary', []), `${'x'.repeat(140)}…`));
  it('off writes a placeholder', () =>
    assert.equal(formatPrompt(long, 'off', []), '(prompt not logged)'));
});

describe('session lifecycle', () => {
  let dir;
  beforeEach(() => {
    dir = tempRepo();
  });

  it('starts, resumes by session id, logs prompts and stops', () => {
    const first = startSession({ tool: 'claude-code', model: 'claude-x', sessionId: 'abcdef123' });
    const again = startSession({ tool: 'claude-code', model: 'claude-x', sessionId: 'abcdef123' });
    assert.equal(again.file, first.file);

    appendPrompt('first prompt with password=hunter2', {
      tool: 'claude-code',
      model: 'claude-x',
      sessionId: 'abcdef123',
    });
    appendPrompt('second prompt', {
      tool: 'claude-code',
      model: 'claude-x',
      sessionId: 'abcdef123',
    });

    writeFileSync(path.join(dir, 'a.txt'), 'hello');
    sh(dir, 'git', ['add', 'a.txt']);
    sh(dir, 'git', ['commit', '-q', '-m', 'feat(app): add a']);
    stopSession({ summary: 'Did the thing' });

    const doc = parseSession(readFileSync(path.join(dir, first.file), 'utf8'));
    assert.equal(doc.meta.commits.length, 1);
    assert.deepEqual(doc.meta.files, ['a.txt']);
    assert.match(doc.body, /### 1 · .*\nfirst prompt with password=\[REDACTED\]/);
    assert.match(doc.body, /### 2 · .*\nsecond prompt/);
    assert.equal(getSection(doc.body, 'Summary'), 'Did the thing');
  });

  it('starts a new log for a different session id', () => {
    const a = startSession({ tool: 'claude-code', sessionId: 'aaaaaa1' });
    const b = startSession({ tool: 'claude-code', sessionId: 'bbbbbb2' });
    assert.notEqual(a.file, b.file);
    assert.equal(readCurrent().sessionId, 'bbbbbb2');
  });
});

describe('trailers', () => {
  beforeEach(() => tempRepo());

  it('builds trailers only for fresh sessions', () => {
    const current = startSession({ tool: 'cursor', model: 'gpt-x', spec: 'specs/auth' });
    assert.deepEqual(trailersFor(current), [
      `AI-Assisted: cursor/gpt-x`,
      'Spec: specs/auth',
    ]);
    const stale = { ...current, startedAt: new Date(Date.now() - 13 * 3600_000).toISOString() };
    assert.deepEqual(trailersFor(stale), []);
  });

  it('add-trailers is idempotent', () => {
    const dir = process.env.AI_LOG_ROOT;
    startSession({ tool: 'cursor', model: 'gpt-x' });
    const msg = path.join(dir, 'MSG');
    writeFileSync(msg, 'feat(app): something\n');
    const script = path.join(here, '..', 'add-trailers.mjs');
    const run = () => sh(dir, process.execPath, [script, msg, 'message']);
    run();
    run();
    const text = readFileSync(msg, 'utf8');
    assert.equal((text.match(/AI-Assisted:/g) ?? []).length, 1);
    assert.doesNotMatch(text, /AI-Session:/);
    assert.match(text, /AI-Assisted: cursor\/gpt-x/);
  });

  it('respects AI_TRACKING=off', () => {
    const current = startSession({ tool: 'cursor', model: 'gpt-x' });
    process.env.AI_TRACKING = 'off';
    try {
      assert.deepEqual(trailersFor(current), []);
    } finally {
      delete process.env.AI_TRACKING;
    }
  });
});
