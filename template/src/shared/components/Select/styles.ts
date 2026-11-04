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
    borderRadius: theme.radii.sm,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    variants: {
      open: {
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
  triggerText: {
    flex: 1,
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
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  searchInput: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.body.fontFamily,
    fontSize: theme.typography.body.fontSize,
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
