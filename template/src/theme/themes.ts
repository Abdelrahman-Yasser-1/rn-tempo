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
// the Medium and SemiBold PostScript names "Medm" and "SmBld". `fontWeight` stays in each style as
// the semantic weight: Android ignores it for custom fonts (the family already is the weight) and
// iOS only uses it to stay within the matched face, so it never changes the rendered face.
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
      fontWeight,
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
