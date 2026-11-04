import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

export const styles = StyleSheet.create((theme) => ({
  list: {
    flexGrow: 1,
    variants: {
      variant: {
        underline: {
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.divider,
        },
        pill: { gap: theme.spacing.sm, padding: theme.spacing.xs },
      },
    },
  },
  tab: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    variants: {
      variant: {
        underline: { borderBottomWidth: 2, borderBottomColor: 'transparent' },
        pill: { borderRadius: theme.radii.full },
      },
      selected: {
        true: {},
        false: {},
      },
    },
    compoundVariants: [
      {
        variant: 'underline',
        selected: true,
        styles: { borderBottomColor: theme.colors.primary },
      },
      {
        variant: 'pill',
        selected: true,
        styles: { backgroundColor: theme.colors.primaryContainer },
      },
    ],
  },
}));
