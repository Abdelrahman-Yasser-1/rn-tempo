import { createScaling, FONT_MAX_SCALE, MAX_SCALE } from './scaling';

describe('createScaling', () => {
  test('AC-2: scales linearly on the base design size', () => {
    const { px, pxH, fontPx } = createScaling({ width: 390, height: 844 });

    expect([px(16), pxH(16), fontPx(16)]).toEqual([16, 16, 16]);
  });

  test('AC-2: px and pxH clamp at 1.2 on large screens', () => {
    const { px, pxH } = createScaling({ width: 1024, height: 2000 });

    expect(px(100)).toBe(Math.round(100 * MAX_SCALE));
    expect(pxH(100)).toBe(Math.round(100 * MAX_SCALE));
  });

  test('AC-2: fontPx clamps at 1.15, tighter than px', () => {
    const { px, fontPx } = createScaling({ width: 1024, height: 2000 });

    expect(fontPx(100)).toBe(Math.round(100 * FONT_MAX_SCALE));
    expect(fontPx(100)).toBeLessThan(px(100));
  });

  test('AC-2: shrinks on small screens (no lower clamp)', () => {
    const { px } = createScaling({ width: 195, height: 422 });

    expect(px(100)).toBe(50);
  });

  test('AC-2: pxM lands between raw and scaled values', () => {
    const { px, pxM } = createScaling({ width: 468, height: 844 });

    expect(px(100)).toBe(120);
    expect(pxM(100)).toBe(110);
    expect(pxM(100, 1)).toBe(120);
    expect(pxM(100, 0)).toBe(100);
  });

  test('AC-2: an unmeasured screen (0x0) falls back to scale 1', () => {
    const { px, fontPx } = createScaling({ width: 0, height: 0 });

    expect([px(24), fontPx(24)]).toEqual([24, 24]);
  });
});
