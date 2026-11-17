import { describe, expect, it } from 'vitest';

import type { ServerInfo } from '../client/types';

import { compareVersions, isOlderThanSupported, urlRows } from './urls';

const info = (lan?: string): ServerInfo => ({
  service: 'tempo-dev-api',
  version: '1.0.0',
  project: 'demo',
  scheme: 'https',
  port: 8555,
  urls: {
    local: 'https://localhost:8555',
    ...(lan === undefined ? {} : { lan }),
    androidEmulator: 'https://10.0.2.2:8555',
    iosSimulator: 'https://localhost:8555',
  },
  cert: { present: true },
  startedAt: '2026-01-01T00:00:00.000Z',
});

describe('urlRows', () => {
  it('lists the Mac, LAN, emulator and simulator addresses', () => {
    const rows = urlRows(info('https://192.168.1.20:8555'));
    expect(rows.map((row) => row.label)).toEqual(['This Mac', 'LAN (phone on the same Wi-Fi)', 'Android emulator', 'iOS simulator']);
    expect(rows[1]?.url).toBe('https://192.168.1.20:8555');
  });

  it('leaves out the LAN row when the server is not on the network', () => {
    expect(urlRows(info()).map((row) => row.label)).not.toContain('LAN (phone on the same Wi-Fi)');
  });
});

describe('compareVersions', () => {
  it('orders numerically, not as text', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('0.9.9', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('2.0', '2.0.0')).toBe(0);
  });

  it('ignores a pre-release suffix and unreadable parts', () => {
    expect(compareVersions('1.2.3-beta.1', '1.2.3')).toBe(0);
    expect(compareVersions('x', '0.0.0')).toBe(0);
  });
});

describe('isOlderThanSupported', () => {
  it('is false for an unknown version (the bundled build)', () => {
    expect(isOlderThanSupported(null)).toBe(false);
  });
  it('is false at the supported minimum', () => {
    expect(isOlderThanSupported('0.0.0')).toBe(false);
  });
});
