import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

export const styles = StyleSheet.create((theme) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    gap: theme.spacing.md,
  },
  outer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: theme.spacing.xl,
    height: theme.spacing.xl,
    borderWidth: 2,
    borderRadius: theme.radii.full,
    borderColor: theme.colors.border,
    variants: {
      selected: {
        true: { borderColor: theme.colors.primary },
        false: {},
      },
      disabled: {
        true: { opacity: 0.5 },
        false: {},
      },
    },
  },
  dot: {
    width: theme.spacing.md,
    height: theme.spacing.md,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
  },
}));
