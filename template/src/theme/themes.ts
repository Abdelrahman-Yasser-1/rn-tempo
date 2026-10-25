import { Platform } from 'react-native';

import { fontPx } from './scaling';
import {
  darkColors,
  lightColors,
  radii,
  shadows,
  spacing,
  typeScale,
  zIndex,
  type AppTheme,
  type ColorTokens,
  type TypographyStyle,
  type TypographyVariant,
} from './tokens';

type FontWeight = TypographyStyle['fontWeight'];

// Android picks the weight from the family name; iOS System honors fontWeight directly.
const fontFamilyFor = (weight: FontWeight): string =>
  Platform.select({
    ios: 'System',
    default: weight === '500' || weight === '600' ? 'sans-serif-medium' : 'sans-serif',
  });

const typography = Object.fromEntries(
  (Object.keys(typeScale) as TypographyVariant[]).map((variant) => {
    const { fontSize, lineHeight, fontWeight } = typeScale[variant];
    const style: TypographyStyle = {
      fontFamily: fontFamilyFor(fontWeight),
      fontSize: fontPx(fontSize),
      lineHeight: fontPx(lineHeight),
      fontWeight,
      letterSpacing: 0,
    };
    return [variant, style];
  }),
) as Record<TypographyVariant, TypographyStyle>;

const createTheme = (name: AppTheme['name'], colors: ColorTokens): AppTheme => ({
  name,
  colors,
  spacing,
  radii,
  typography,
  shadows,
  zIndex,
});

export const lightTheme = createTheme('light', lightColors);
export const darkTheme = createTheme('dark', darkColors);
