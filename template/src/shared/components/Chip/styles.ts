import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  root: {
    // The visible chip is smaller than the touch target; hitSlop makes up the difference.
    alignSelf: 'flex-start',
    minHeight: theme.spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xs,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
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
