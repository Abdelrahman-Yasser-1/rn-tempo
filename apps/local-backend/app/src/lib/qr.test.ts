import { describe, expect, it } from 'vitest';

import { qrMatrix, qrPath } from './qr';

describe('qrMatrix', () => {
  it('makes a square grid with the finder pattern in the corner', () => {
    const matrix = qrMatrix('https://192.168.1.20:8555');
    expect(matrix).not.toBeNull();
    const grid = matrix ?? [];
    expect(grid.length).toBeGreaterThanOrEqual(21);
    for (const row of grid) expect(row).toHaveLength(grid.length);
    // The top-left finder pattern is a 7x7 ring: the corner module and the rest of its first row are dark.
    expect(grid[0]?.slice(0, 7).every(Boolean)).toBe(true);
    expect(grid[1]?.[1]).toBe(false);
  });

  it('gives the same grid for the same text', () => {
    expect(qrMatrix('a')).toEqual(qrMatrix('a'));
  });

  it('returns null when the text cannot be encoded', () => {
    expect(qrMatrix('x'.repeat(5000))).toBeNull();
  });
});

describe('qrPath', () => {
  it('draws one square per dark module', () => {
    expect(qrPath([[true, false], [false, true]])).toBe('M0 0h1v1h-1zM1 1h1v1h-1z');
  });
});
