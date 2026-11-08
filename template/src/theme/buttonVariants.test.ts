import {
  getButtonContentColor,
  getButtonVariantColors,
  type ButtonVariant,
} from './buttonVariants';
import { contrast } from './testContrast';
import { darkTheme, lightTheme } from './themes';

const AA = 4.5;
const VARIANTS: ButtonVariant[] = [
  'primary',
  'neutral',
  'secondary',
  'outline',
  'outlineOnColor',
  'subtle',
  'ghost',
  'danger',
  'dangerOutline',
  'dangerSubtle',
  'dangerGhost',
  'link',
];

describe.each([
  ['light', lightTheme],
  ['dark', darkTheme],
])('button variant contrast (%s)', (_name, theme) => {
  const variants = getButtonVariantColors(theme);

  // Transparent fills sit on the page; `outlineOnColor` is meant for a primary-coloured surface.
  const surface = (variant: ButtonVariant, fill: string): string => {
    if (fill !== 'transparent') {
      return fill;
    }
    return variant === 'outlineOnColor' ? theme.colors.primary : theme.colors.background;
  };

  test.each(VARIANTS)('%s content meets AA on its background', (variant) => {
    const content = getButtonContentColor(theme, variant);
    const ratio = contrast(content, surface(variant, variants[variant].background));
    expect(ratio).toBeGreaterThanOrEqual(AA);
  });

  test.each(VARIANTS)('%s content meets AA on its pressed background', (variant) => {
    const { pressedBackground } = variants[variant];
    const content = getButtonContentColor(theme, variant);
    // Transparent pressed fills fall back to the resting surface, already covered above.
    const ratio = contrast(content, surface(variant, pressedBackground));
    expect(ratio).toBeGreaterThanOrEqual(AA);
  });
});
