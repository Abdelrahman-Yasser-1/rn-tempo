import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

export const styles = StyleSheet.create((theme) => ({
  root: {
    gap: theme.spacing.xs,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceVariant,
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
        true: { backgroundColor: theme.colors.surface },
        false: {},
      },
    },
  },
  input: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.body.fontFamily,
    fontSize: theme.typography.body.fontSize,
    variants: {
      disabled: {
        true: { color: theme.colors.textDisabled },
        false: {},
      },
    },
  },
  adornment: {
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
