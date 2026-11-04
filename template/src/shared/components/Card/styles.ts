import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  root: {
    overflow: 'hidden',
    borderRadius: theme.radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    variants: {
      variant: {
        elevated: { backgroundColor: theme.colors.background, ...theme.shadows.md },
        outlined: { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
        filled: { backgroundColor: theme.colors.surfaceVariant },
      },
    },
  },
  media: {
    alignSelf: 'stretch',
  },
  // Fills the media area; touches fall through to the card except on the overlay's own controls.
  overlay: {
    ...StyleSheet.absoluteFillObject,
    padding: theme.spacing.md,
  },
  content: {
    variants: {
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
