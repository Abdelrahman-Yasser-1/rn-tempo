import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

export const styles = StyleSheet.create((theme) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    minHeight: MIN_TOUCH_TARGET,
    gap: theme.spacing.md,
    marginHorizontal: theme.spacing.lg,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    ...theme.shadows.lg,
    variants: {
      type: {
        success: { backgroundColor: theme.colors.success },
        error: { backgroundColor: theme.colors.error },
        info: { backgroundColor: theme.colors.info },
        warning: { backgroundColor: theme.colors.warning },
      },
    },
  },
  body: {
    flex: 1,
    gap: theme.spacing.xxs,
  },
}));
