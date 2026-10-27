import { useTranslation } from 'react-i18next';
import { Text as RNText } from 'react-native';

import { styles } from './styles';
import type { TextProps } from './types';

const HEADING_VARIANTS = new Set(['display', 'h1', 'h2', 'h3']);

/** Themed text: typography and color tokens, i18n `tx` keys and a capped font scale. */
export function Text({
  variant = 'body',
  color = 'textPrimary',
  align,
  tx,
  txOptions,
  children,
  maxFontSizeMultiplier = 1.5,
  accessibilityRole,
  style,
  ...rest
}: TextProps) {
  const { t } = useTranslation();
  styles.useVariants({ variant, align });

  return (
    <RNText
      accessibilityRole={
        accessibilityRole ?? (HEADING_VARIANTS.has(variant) ? 'header' : undefined)
      }
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      {...rest}
      style={[styles.text, styles.color(color), style]}
    >
      {tx ? t(tx, txOptions) : children}
    </RNText>
  );
}
