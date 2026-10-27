import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay,
  },
  panel: {
    alignSelf: 'stretch',
    gap: theme.spacing.md,
    padding: theme.spacing.xl,
    borderRadius: theme.radii.xl,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.lg,
  },
}));
