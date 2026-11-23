import { fontPx } from './scaling';
import { buildTypography, DEFAULT_FONT_SCALE, FONT_SCALES, parseFontScale } from './themes';
import { typeScale, type TypographyVariant } from './tokens';

const VARIANTS = Object.keys(typeScale) as TypographyVariant[];

describe('buildTypography', () => {
  test('AC-F-2: scale 1 is the device-capped design size', () => {
    const typography = buildTypography(1);

    for (const variant of VARIANTS) {
      expect(typography[variant].fontSize).toBe(fontPx(typeScale[variant].fontSize));
      expect(typography[variant].lineHeight).toBe(fontPx(typeScale[variant].lineHeight));
    }
  });

  test('AC-F-2: font and line height are base x userScale, rounded', () => {
    const typography = buildTypography(1.3);

    for (const variant of VARIANTS) {
      expect(typography[variant].fontSize).toBe(
        Math.round(fontPx(typeScale[variant].fontSize) * 1.3),
      );
      expect(typography[variant].lineHeight).toBe(
        Math.round(fontPx(typeScale[variant].lineHeight) * 1.3),
      );
    }
  });

  test('AC-F-1: sizes grow with every step of the scale', () => {
    const sizes = FONT_SCALES.map((scale) => buildTypography(scale).body.fontSize);

    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
    expect(new Set(sizes).size).toBe(FONT_SCALES.length);
  });

  test('AC-F-2: line height stays at least the font size at every scale', () => {
    for (const scale of FONT_SCALES) {
      const typography = buildTypography(scale);
      for (const variant of VARIANTS) {
        expect(typography[variant].lineHeight).toBeGreaterThanOrEqual(typography[variant].fontSize);
      }
    }
  });

  test('defaults to the default scale', () => {
    expect(buildTypography()).toEqual(buildTypography(DEFAULT_FONT_SCALE));
  });
});

describe('parseFontScale', () => {
  test('accepts the four scales as numbers or strings', () => {
    for (const scale of FONT_SCALES) {
      expect(parseFontScale(scale)).toBe(scale);
      expect(parseFontScale(String(scale))).toBe(scale);
    }
  });

  test('rejects anything else', () => {
    for (const value of [undefined, null, '', 'abc', '1.2', 2, 0, NaN]) {
      expect(parseFontScale(value)).toBeUndefined();
    }
  });
});
