import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

export const styles = StyleSheet.create((theme) => ({
  root: {
    // The visible chip is smaller than the touch target; hitSlop makes up the difference.
    alignSelf: 'flex-start',
    minHeight: MIN_TOUCH_TARGET - theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderWidth: 1,
    borderRadius: theme.radii.full,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceVariant,
    variants: {
      selected: {
        true: {
          borderColor: theme.colors.primary,
          backgroundColor: theme.colors.primaryContainer,
        },
        false: {},
      },
      disabled: {
        true: { opacity: 0.5 },
        false: {},
      },
    },
  },
}));
