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
  test('keep the plan anchor colors', () => {
    expect(lightTheme.colors.primary).toBe('#2563EB');
    expect(darkTheme.colors.background).toBe('#0B1220');
  });

  test('typography follows the type scale', () => {
    expect(lightTheme.typography.body).toMatchObject({ fontWeight: '400' });
    expect(lightTheme.typography.display.fontSize).toBeGreaterThan(
      lightTheme.typography.h1.fontSize,
    );
    expect(lightTheme.name).toBe('light');
    expect(darkTheme.name).toBe('dark');
  });
});
