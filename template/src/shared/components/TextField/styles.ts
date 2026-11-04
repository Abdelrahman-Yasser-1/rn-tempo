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
    borderRadius: theme.radii.sm,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    variants: {
      multiline: {
        true: { alignItems: 'flex-start' },
        false: {},
      },
      focused: {
        true: { borderColor: theme.colors.focus },
        false: {},
      },
      invalid: {
        true: { borderColor: theme.colors.error },
        false: {},
      },
      readOnly: {
        true: { backgroundColor: theme.colors.surface, borderColor: theme.colors.divider },
        false: {},
      },
      disabled: {
        true: { backgroundColor: theme.colors.surface, borderColor: theme.colors.divider },
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
      multiline: {
        true: { textAlignVertical: 'top' },
        false: {},
      },
      disabled: {
        true: { color: theme.colors.textDisabled },
        false: {},
      },
    },
  },
  // Height of a multiline input showing `lines` lines of body text.
  multilineHeight: (lines: number) => ({
    minHeight: lines * theme.typography.body.lineHeight + theme.spacing.sm * 2,
  }),
  adornment: {
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
