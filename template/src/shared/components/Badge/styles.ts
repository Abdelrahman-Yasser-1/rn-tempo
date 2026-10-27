import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  root: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.full,
    variants: {
      variant: {
        neutral: { backgroundColor: theme.colors.surfaceVariant },
        primary: { backgroundColor: theme.colors.primary },
        success: { backgroundColor: theme.colors.success },
        warning: { backgroundColor: theme.colors.warning },
        error: { backgroundColor: theme.colors.error },
        info: { backgroundColor: theme.colors.info },
      },
      size: {
        sm: { minWidth: theme.spacing.lg, paddingHorizontal: theme.spacing.xs },
        md: {
          minWidth: theme.spacing.xl,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.xxs,
        },
      },
    },
  },
}));
