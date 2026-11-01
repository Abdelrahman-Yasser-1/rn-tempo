import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

export const styles = StyleSheet.create((theme) => ({
  root: {
    gap: theme.spacing.xs,
  },
  row: {
    // Digits read left to right in every locale.
    direction: 'ltr',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  cell: {
    width: MIN_TOUCH_TARGET,
    height: theme.spacing.xxxl + theme.spacing.xs,
    textAlign: 'center',
    borderWidth: 1,
    borderRadius: theme.radii.md,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceVariant,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.h3.fontFamily,
    fontSize: theme.typography.h3.fontSize,
    variants: {
      focused: {
        true: { borderColor: theme.colors.focus },
        false: {},
      },
      invalid: {
        true: { borderColor: theme.colors.error },
        false: {},
      },
      disabled: {
        true: { color: theme.colors.textDisabled, backgroundColor: theme.colors.surface },
        false: {},
      },
    },
  },
}));
