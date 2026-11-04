import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';
import { getButtonVariantColors } from '@theme/buttonVariants';

export const styles = StyleSheet.create((theme) => {
  const colors = getButtonVariantColors(theme);

  return {
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderRadius: theme.radii.full,
      variants: {
        variant: {
          primary: {
            backgroundColor: colors.primary.background,
            borderColor: colors.primary.border,
          },
          neutral: {
            backgroundColor: colors.neutral.background,
            borderColor: colors.neutral.border,
          },
          secondary: {
            backgroundColor: colors.secondary.background,
            borderColor: colors.secondary.border,
          },
          outline: {
            backgroundColor: colors.outline.background,
            borderColor: colors.outline.border,
          },
          outlineOnColor: {
            backgroundColor: colors.outlineOnColor.background,
            borderColor: colors.outlineOnColor.border,
          },
          subtle: { backgroundColor: colors.subtle.background, borderColor: colors.subtle.border },
          ghost: { backgroundColor: colors.ghost.background, borderColor: colors.ghost.border },
          danger: { backgroundColor: colors.danger.background, borderColor: colors.danger.border },
          dangerOutline: {
            backgroundColor: colors.dangerOutline.background,
            borderColor: colors.dangerOutline.border,
          },
          dangerSubtle: {
            backgroundColor: colors.dangerSubtle.background,
            borderColor: colors.dangerSubtle.border,
          },
          dangerGhost: {
            backgroundColor: colors.dangerGhost.background,
            borderColor: colors.dangerGhost.border,
          },
          link: { backgroundColor: colors.link.background, borderColor: colors.link.border },
        },
        size: {
          sm: { padding: theme.spacing.sm },
          md: {
            minWidth: MIN_TOUCH_TARGET,
            minHeight: MIN_TOUCH_TARGET,
            padding: theme.spacing.md,
          },
          lg: { padding: theme.spacing.lg },
        },
      },
    },
    // Applied on top of `container` while disabled.
    disabled: {
      variants: {
        variant: {
          primary: {
            backgroundColor: colors.primary.disabledBackground,
            borderColor: colors.primary.disabledBorder,
          },
          neutral: {
            backgroundColor: colors.neutral.disabledBackground,
            borderColor: colors.neutral.disabledBorder,
          },
          secondary: {
            backgroundColor: colors.secondary.disabledBackground,
            borderColor: colors.secondary.disabledBorder,
          },
          outline: {
            backgroundColor: colors.outline.disabledBackground,
            borderColor: colors.outline.disabledBorder,
          },
          outlineOnColor: {
            backgroundColor: colors.outlineOnColor.disabledBackground,
            borderColor: colors.outlineOnColor.disabledBorder,
          },
          subtle: {
            backgroundColor: colors.subtle.disabledBackground,
            borderColor: colors.subtle.disabledBorder,
          },
          ghost: {
            backgroundColor: colors.ghost.disabledBackground,
            borderColor: colors.ghost.disabledBorder,
          },
          danger: {
            backgroundColor: colors.danger.disabledBackground,
            borderColor: colors.danger.disabledBorder,
          },
          dangerOutline: {
            backgroundColor: colors.dangerOutline.disabledBackground,
            borderColor: colors.dangerOutline.disabledBorder,
          },
          dangerSubtle: {
            backgroundColor: colors.dangerSubtle.disabledBackground,
            borderColor: colors.dangerSubtle.disabledBorder,
          },
          dangerGhost: {
            backgroundColor: colors.dangerGhost.disabledBackground,
            borderColor: colors.dangerGhost.disabledBorder,
          },
          link: {
            backgroundColor: colors.link.disabledBackground,
            borderColor: colors.link.disabledBorder,
          },
        },
      },
    },
  };
});
