import { getStatusTint, type StatusTone } from './statusTints';
import { contrast } from './testContrast';
import { darkTheme, lightTheme } from './themes';

const TONES: StatusTone[] = ['success', 'warning', 'error', 'info'];

describe.each([
  ['light', lightTheme],
  ['dark', darkTheme],
])('status tints (%s)', (_name, theme) => {
  test.each(TONES)('%s text meets AA on its tint', (tone) => {
    const tint = getStatusTint(theme, tone);
    expect(contrast(tint.text, tint.background)).toBeGreaterThanOrEqual(4.5);
  });

  test.each(TONES)('%s icon meets 3:1 on its tint', (tone) => {
    const tint = getStatusTint(theme, tone);
    expect(contrast(tint.icon, tint.background)).toBeGreaterThanOrEqual(3);
  });
});
