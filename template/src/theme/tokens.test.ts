import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { palette } from './palette';
import { darkTheme, lightTheme } from './themes';
import { darkColors, lightColors, type ColorTokens } from './tokens';

const channel = (hex: string, offset: number): number => {
  const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string): number =>
  0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
const contrast = (a: string, b: string): number => {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
};

const TEXT_PAIRS: [foreground: keyof ColorTokens, background: keyof ColorTokens][] = [
  ['onPrimary', 'primary'],
  ['onPrimaryContainer', 'primaryContainer'],
  ['onSecondary', 'secondary'],
  ['onBackground', 'background'],
  ['onSurface', 'surface'],
  ['onSurfaceVariant', 'surfaceVariant'],
  ['textPrimary', 'background'],
  ['textPrimary', 'surface'],
  ['textSecondary', 'background'],
  ['textSecondary', 'surface'],
  ['onSuccess', 'success'],
  ['onWarning', 'warning'],
  ['onError', 'error'],
  ['onInfo', 'info'],
];

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
])('%s palette', (_name, colors) => {
  test.each(TEXT_PAIRS)('%s on %s meets WCAG AA (4.5:1)', (foreground, background) => {
    expect(contrast(colors[foreground], colors[background])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('themes', () => {
  test('use the DGA anchor colors', () => {
    expect(lightTheme.colors.primary).toBe('#1B8354');
    expect(darkTheme.colors.background).toBe('#0D121C');
  });

  test('typography follows the type scale', () => {
    expect(lightTheme.typography.body).toMatchObject({ fontWeight: '400' });
    expect(lightTheme.typography.display.fontSize).toBeGreaterThan(
      lightTheme.typography.h1.fontSize,
    );
    expect(lightTheme.name).toBe('light');
    expect(darkTheme.name).toBe('dark');
  });

  test('exposes the palette primitives on the theme', () => {
    expect(lightTheme.palette).toBe(palette);
    expect(darkTheme.palette).toBe(palette);
  });

  test('every typography family is a bundled font file', () => {
    const fontDir = path.join(__dirname, '../assets/fonts');
    for (const style of Object.values(lightTheme.typography)) {
      expect(existsSync(path.join(fontDir, `${style.fontFamily}.ttf`))).toBe(true);
    }
    expect(lightTheme.typography.display.fontFamily).toBe('IBMPlexSansArabic-Bold');
    expect(lightTheme.typography.body.fontFamily).toBe('IBMPlexSansArabic');
  });
});

describe('token sources', () => {
  const source = readFileSync(path.join(__dirname, 'tokens.ts'), 'utf8');
  const flat = Object.values(palette).flatMap((value) =>
    typeof value === 'string' ? [value] : Object.values(value),
  );

  test('tokens.ts holds no raw hex literals', () => {
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  test.each([
    ['light', lightColors],
    ['dark', darkColors],
  ])('%s opaque colors all come from the palette', (_name, colors) => {
    for (const [token, value] of Object.entries(colors)) {
      if (value.startsWith('rgba')) continue;
      expect([token, flat]).toEqual([token, expect.arrayContaining([value])]);
    }
  });

  test('color values snapshot', () => {
    expect({ light: lightColors, dark: darkColors }).toMatchSnapshot();
  });
});
