import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

export const styles = StyleSheet.create((theme) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    gap: theme.spacing.md,
  },
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    width: theme.spacing.xl,
    height: theme.spacing.xl,
    borderWidth: 2,
    borderRadius: theme.radii.sm,
    borderColor: theme.colors.border,
    backgroundColor: 'transparent',
    variants: {
      checked: {
        true: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary },
        false: {},
      },
      disabled: {
        true: { borderColor: theme.colors.border, opacity: 0.5 },
        false: {},
      },
    },
  },
}));
