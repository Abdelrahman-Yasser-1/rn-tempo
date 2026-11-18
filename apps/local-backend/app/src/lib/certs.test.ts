import { describe, expect, it } from 'vitest';

import type { ServerInfo } from '../client/types';

import { caDownloadUrl, summarizeCert } from './certs';

const NOW = Date.parse('2026-06-01T00:00:00Z');
const info = (overrides: Partial<ServerInfo> = {}, cert: ServerInfo['cert'] = { present: true }): ServerInfo => ({
  service: 'tempo-dev-api',
  version: '1',
  project: 'p',
  scheme: 'https',
  port: 8555,
  urls: { local: 'https://localhost:8555', lan: 'https://192.168.1.5:8555', androidEmulator: 'https://10.0.2.2:8555', iosSimulator: 'https://localhost:8555' },
  cert,
  startedAt: '2026-06-01T00:00:00Z',
  ...overrides,
});

describe('summarizeCert', () => {
  it('asks to create a certificate when there is none', () => {
    expect(summarizeCert({ hasCert: false }, undefined, NOW).tone).toBe('bad');
  });

  it('is calm when a cert exists and the server is stopped', () => {
    expect(summarizeCert({ hasCert: true }, undefined, NOW).tone).toBe('ok');
  });

  it('reports expiry in days and LAN coverage', () => {
    const summary = summarizeCert({ hasCert: true }, info({}, { present: true, notAfter: '2026-07-01T00:00:00Z', coversLanIp: true }), NOW);
    expect(summary.text).toContain('30 days');
    expect(summary.text).toContain('covers your LAN address');
    expect(summary.tone).toBe('ok');
  });

  it('warns when the LAN address is not covered', () => {
    const summary = summarizeCert({ hasCert: true }, info({}, { present: true, notAfter: '2027-01-01T00:00:00Z', coversLanIp: false }), NOW);
    expect(summary.tone).toBe('warn');
    expect(summary.text).toContain('Recreate');
  });

  it('flags an expired certificate', () => {
    expect(summarizeCert({ hasCert: true }, info({}, { present: true, notAfter: '2026-01-01T00:00:00Z' }), NOW).tone).toBe('bad');
  });

  it('warns when the server runs on HTTP although a cert exists', () => {
    expect(summarizeCert({ hasCert: true }, info({ scheme: 'http' }), NOW).tone).toBe('warn');
  });
});

describe('caDownloadUrl', () => {
  it('points at the LAN address over HTTPS', () => {
    expect(caDownloadUrl(info())).toBe('https://192.168.1.5:8555/__tempo/ca.pem');
  });
  it('is null without HTTPS, a LAN address, or a server', () => {
    expect(caDownloadUrl(info({ scheme: 'http' }))).toBeNull();
    expect(caDownloadUrl(info({ urls: { local: 'a', androidEmulator: 'b', iosSimulator: 'c' } }))).toBeNull();
    expect(caDownloadUrl(undefined)).toBeNull();
  });
});
