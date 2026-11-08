import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { palette } from './palette';
import { contrast } from './testContrast';
import { darkTheme, lightTheme } from './themes';
import type * as Themes from './themes';
import { darkColors, lightColors, type ColorTokens } from './tokens';

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

  test('keeps the semantic weight on iOS but leaves the weight to the family on Android', () => {
    expect(lightTheme.typography.display.fontWeight).toBe('700');

    jest.isolateModules(() => {
      jest.doMock('react-native', () => ({ Platform: { OS: 'android' } }));
      const { lightTheme: androidTheme } = jest.requireActual<typeof Themes>('./themes');
      for (const style of Object.values(androidTheme.typography)) {
        expect(style.fontWeight).toBe('400');
      }
      expect(androidTheme.typography.display.fontFamily).toBe('IBMPlexSansArabic-Bold');
    });
    jest.dontMock('react-native');
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
      if (value.startsWith('rgba')) {
        continue;
      }
      expect([token, flat]).toEqual([token, expect.arrayContaining([value])]);
    }
  });

  test('color values snapshot', () => {
    expect({ light: lightColors, dark: darkColors }).toMatchInlineSnapshot(`
      {
        "dark": {
          "background": "#0D121C",
          "border": "#384250",
          "divider": "#1F2A37",
          "error": "#F97066",
          "focus": "#88D8AD",
          "info": "#53B1FD",
          "onBackground": "#FCFCFD",
          "onError": "#0D121C",
          "onInfo": "#0D121C",
          "onPrimary": "#092A1E",
          "onPrimaryContainer": "#DFF6E7",
          "onSecondary": "#0D121C",
          "onSuccess": "#0D121C",
          "onSurface": "#FCFCFD",
          "onSurfaceVariant": "#D2D6DB",
          "onWarning": "#0D121C",
          "overlay": "rgba(0, 0, 0, 0.6)",
          "primary": "#54C08A",
          "primaryContainer": "#14573A",
          "secondary": "#A57BBA",
          "skeletonBase": "#1F2A37",
          "skeletonHighlight": "#384250",
          "success": "#47CD89",
          "surface": "#111927",
          "surfaceVariant": "#1F2A37",
          "textDisabled": "#4D5761",
          "textInverse": "#161616",
          "textPrimary": "#FCFCFD",
          "textSecondary": "#9DA4AE",
          "warning": "#FDB022",
        },
        "light": {
          "background": "#FFFFFF",
          "border": "#D2D6DB",
          "divider": "#E5E7EB",
          "error": "#D92D20",
          "focus": "#166A45",
          "info": "#1570EF",
          "onBackground": "#161616",
          "onError": "#FFFFFF",
          "onInfo": "#FFFFFF",
          "onPrimary": "#FFFFFF",
          "onPrimaryContainer": "#104631",
          "onSecondary": "#FFFFFF",
          "onSuccess": "#FFFFFF",
          "onSurface": "#161616",
          "onSurfaceVariant": "#4D5761",
          "onWarning": "#161616",
          "overlay": "rgba(13, 18, 28, 0.5)",
          "primary": "#1B8354",
          "primaryContainer": "#DFF6E7",
          "secondary": "#6D428F",
          "skeletonBase": "#E5E7EB",
          "skeletonHighlight": "#F3F4F6",
          "success": "#067647",
          "surface": "#F9FAFB",
          "surfaceVariant": "#F3F4F6",
          "textDisabled": "#9DA4AE",
          "textInverse": "#FFFFFF",
          "textPrimary": "#161616",
          "textSecondary": "#384250",
          "warning": "#DC6803",
        },
      }
    `);
  });
});
