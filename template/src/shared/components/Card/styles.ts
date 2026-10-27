import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  root: {
    borderRadius: theme.radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    variants: {
      variant: {
        elevated: { backgroundColor: theme.colors.surface, ...theme.shadows.md },
        outlined: { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
        filled: { backgroundColor: theme.colors.surfaceVariant },
      },
      padding: {
        none: { padding: theme.spacing.none },
        sm: { padding: theme.spacing.sm },
        md: { padding: theme.spacing.md },
        lg: { padding: theme.spacing.lg },
        xl: { padding: theme.spacing.xl },
      },
    },
  },
}));
