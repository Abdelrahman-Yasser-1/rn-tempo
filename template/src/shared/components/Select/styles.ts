import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

export const styles = StyleSheet.create((theme) => ({
  root: {
    gap: theme.spacing.xs,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH_TARGET,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceVariant,
    variants: {
      open: {
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
  triggerText: {
    flex: 1,
  },
  chevron: {
    transform: [{ rotate: '90deg' }],
  },
  sheetBackground: {
    backgroundColor: theme.colors.surface,
  },
  sheetHandle: {
    backgroundColor: theme.colors.border,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  sheetContent: {
    paddingBottom: theme.spacing.xxl,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH_TARGET,
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    variants: {
      selected: {
        true: { backgroundColor: theme.colors.primaryContainer },
        false: {},
      },
    },
  },
}));
