import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing.sm,
  },
  dot: {
    borderRadius: theme.radii.full,
    variants: {
      status: {
        success: { backgroundColor: theme.colors.success },
        warning: { backgroundColor: theme.colors.warning },
        error: { backgroundColor: theme.colors.error },
        info: { backgroundColor: theme.colors.info },
        neutral: { backgroundColor: theme.colors.textSecondary },
      },
      size: {
        sm: { width: theme.spacing.sm, height: theme.spacing.sm },
        md: { width: theme.spacing.md, height: theme.spacing.md },
      },
    },
  },
}));
