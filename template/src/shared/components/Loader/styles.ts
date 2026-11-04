import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    variants: {
      variant: {
        inline: { gap: theme.spacing.sm, padding: theme.spacing.lg },
        overlay: {
          ...StyleSheet.absoluteFillObject,
          zIndex: theme.zIndex.modal,
          backgroundColor: theme.colors.overlay,
        },
      },
    },
  },
  // The surface the spinner sits on in the overlay, so it reads on the dark scrim.
  panel: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.xl,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.background,
    ...theme.shadows.md,
  },
}));
