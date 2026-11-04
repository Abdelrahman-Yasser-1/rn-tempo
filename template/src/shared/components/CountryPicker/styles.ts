import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

export const styles = StyleSheet.create((theme) => ({
  root: {
    gap: theme.spacing.xs,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    variants: {
      compact: {
        true: { paddingHorizontal: theme.spacing.xs, gap: theme.spacing.xs },
        false: {
          borderWidth: 1,
          borderRadius: theme.radii.sm,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.background,
        },
      },
      open: {
        true: {},
        false: {},
      },
      invalid: {
        true: {},
        false: {},
      },
      readOnly: {
        true: {},
        false: {},
      },
      disabled: {
        true: { opacity: 0.5 },
        false: {},
      },
    },
    compoundVariants: [
      { compact: false, open: true, styles: { borderColor: theme.colors.focus } },
      { compact: false, invalid: true, styles: { borderColor: theme.colors.error } },
      {
        compact: false,
        readOnly: true,
        styles: { backgroundColor: theme.colors.surface, borderColor: theme.colors.divider },
      },
    ],
  },
  name: {
    flex: 1,
  },
  flag: {
    fontSize: theme.typography.title.fontSize,
  },
  // The dial code reads left to right in every locale.
  dial: {
    writingDirection: 'ltr',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
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
  list: {
    paddingBottom: theme.spacing.xxl,
  },
}));
