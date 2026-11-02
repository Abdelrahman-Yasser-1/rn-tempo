import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  content: { padding: theme.spacing.lg, gap: theme.spacing.xl },
  section: {
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    minHeight: 44,
  },
  value: { flexShrink: 1 },
  buttons: { flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' },
}));
