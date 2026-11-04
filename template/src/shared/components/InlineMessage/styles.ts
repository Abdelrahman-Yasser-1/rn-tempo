import { StyleSheet } from 'react-native-unistyles';

import { getStatusTint } from '@theme/statusTints';

export const styles = StyleSheet.create((theme) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    variants: {
      variant: {
        info: {
          backgroundColor: getStatusTint(theme, 'info').background,
          borderColor: getStatusTint(theme, 'info').border,
        },
        success: {
          backgroundColor: getStatusTint(theme, 'success').background,
          borderColor: getStatusTint(theme, 'success').border,
        },
        warning: {
          backgroundColor: getStatusTint(theme, 'warning').background,
          borderColor: getStatusTint(theme, 'warning').border,
        },
        error: {
          backgroundColor: getStatusTint(theme, 'error').background,
          borderColor: getStatusTint(theme, 'error').border,
        },
      },
    },
  },
  body: {
    flex: 1,
    gap: theme.spacing.xs,
    alignItems: 'flex-start',
  },
  text: (color: string) => ({ color }),
}));
