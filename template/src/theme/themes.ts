import { Platform } from 'react-native';

import { palette } from './palette';
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

// One family string per weight, equal to the font file name and PostScript name, so the same value
// works on iOS (resolved by font name) and Android (resolved by assets/fonts/<name>.ttf). IBM names
// the Medium and SemiBold PostScript names "Medm" and "SmBld". iOS keeps the semantic `fontWeight`
// (it only picks within the matched face). Android gets '400': it applies `fontWeight` on top of a
// custom family, and a non-400 weight there makes text measure narrower than it draws, so Arabic
// labels such as "كلمة المرور" were clipped to their first word. The family already is the weight.
const FONT_FAMILY: Record<FontWeight, string> = {
  '400': 'IBMPlexSansArabic',
  '500': 'IBMPlexSansArabic-Medm',
  '600': 'IBMPlexSansArabic-SmBld',
  '700': 'IBMPlexSansArabic-Bold',
};

const fontFamilyFor = (weight: FontWeight): string => FONT_FAMILY[weight];

const typography = Object.fromEntries(
  (Object.keys(typeScale) as TypographyVariant[]).map((variant) => {
    const { fontSize, lineHeight, fontWeight } = typeScale[variant];
    const style: TypographyStyle = {
      fontFamily: fontFamilyFor(fontWeight),
      fontSize: fontPx(fontSize),
      lineHeight: fontPx(lineHeight),
      fontWeight: Platform.OS === 'android' ? '400' : fontWeight,
      letterSpacing: 0,
    };
    return [variant, style];
  }),
) as Record<TypographyVariant, TypographyStyle>;

const createTheme = (name: AppTheme['name'], colors: ColorTokens): AppTheme => ({
  name,
  colors,
  palette,
  spacing,
  radii,
  typography,
  shadows,
  zIndex,
});

export const lightTheme = createTheme('light', lightColors);
export const darkTheme = createTheme('dark', darkColors);
