import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

export const styles = StyleSheet.create((theme) => ({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    borderRadius: theme.radii.full,
    variants: {
      variant: {
        primary: { backgroundColor: theme.colors.primary },
        secondary: { backgroundColor: theme.colors.secondary },
        outline: { backgroundColor: 'transparent', borderColor: theme.colors.primary },
        ghost: { backgroundColor: 'transparent' },
        danger: { backgroundColor: theme.colors.error },
      },
      size: {
        sm: { padding: theme.spacing.sm },
        md: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, padding: theme.spacing.md },
        lg: { padding: theme.spacing.lg },
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
