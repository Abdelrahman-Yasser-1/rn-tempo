import { describe, expect, it } from 'vitest';

import { addressRows } from './addresses';
import { formatBytes, formatMs, formatPercent } from './format';

describe('addressRows', () => {
  it('lists the four ways to reach a running backend', () => {
    const rows = addressRows({ scheme: 'https', port: 8556 }, '192.168.1.20');
    expect(rows.map((row) => [row.label, row.url])).toEqual([
      ['This Mac', 'https://localhost:8556'],
      ['Phone on Wi-Fi', 'https://192.168.1.20:8556'],
      ['Android emulator', 'https://10.0.2.2:8556'],
      ['iOS simulator', 'https://localhost:8556'],
    ]);
  });
  it('says so when there is no Wi-Fi address, and lists nothing when stopped', () => {
    expect(addressRows({ scheme: 'http', port: 1 }, null)[1]).toMatchObject({ url: null });
    expect(addressRows({ scheme: null, port: null }, null)).toEqual([]);
  });
});

describe('format', () => {
  it('formats sizes, shares and times', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.034)).toBe('3.4%');
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatMs(42.4)).toBe('42 ms');
    expect(formatMs(2500)).toBe('2.5 s');
  });
});
