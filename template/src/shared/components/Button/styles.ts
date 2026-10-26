import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

export const styles = StyleSheet.create((theme) => ({
  root: {
    variants: {
      fullWidth: {
        true: { alignSelf: 'stretch' },
        false: { alignSelf: 'flex-start' },
      },
    },
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    borderRadius: theme.radii.md,
    variants: {
      variant: {
        primary: { backgroundColor: theme.colors.primary },
        secondary: { backgroundColor: theme.colors.secondary },
        outline: { backgroundColor: 'transparent', borderColor: theme.colors.primary },
        ghost: { backgroundColor: 'transparent' },
        danger: { backgroundColor: theme.colors.error },
      },
      size: {
        sm: { paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md },
        md: {
          minHeight: MIN_TOUCH_TARGET,
          paddingVertical: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
        },
        lg: {
          minHeight: MIN_TOUCH_TARGET,
          paddingVertical: theme.spacing.lg,
          paddingHorizontal: theme.spacing.xl,
        },
      },
      disabled: {
        true: {},
        false: {},
      },
    },
    compoundVariants: [
      {
        variant: 'primary',
        disabled: true,
        styles: { backgroundColor: theme.colors.surfaceVariant },
      },
      {
        variant: 'secondary',
        disabled: true,
        styles: { backgroundColor: theme.colors.surfaceVariant },
      },
      {
        variant: 'danger',
        disabled: true,
        styles: { backgroundColor: theme.colors.surfaceVariant },
      },
      { variant: 'outline', disabled: true, styles: { borderColor: theme.colors.border } },
    ],
  },
}));
