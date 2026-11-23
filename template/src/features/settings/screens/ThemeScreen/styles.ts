import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  content: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  /** Brand colour dot shown next to a palette name; it previews the palette in the current mode. */
  swatch: (color: string) => ({
    width: theme.spacing.xl,
    height: theme.spacing.xl,
    borderRadius: theme.radii.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: color,
  }),
}));
