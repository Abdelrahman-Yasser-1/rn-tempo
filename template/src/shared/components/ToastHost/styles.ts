import { StyleSheet } from 'react-native-unistyles';

import { MIN_TOUCH_TARGET } from '@shared/constants/touch';

export const styles = StyleSheet.create((theme) => ({
  card: {
    alignSelf: 'stretch',
    marginHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStartWidth: theme.spacing.xs,
    backgroundColor: theme.colors.background,
    overflow: 'hidden',
    ...theme.shadows.lg,
    variants: {
      // The status colour bar at the start edge.
      type: {
        success: { borderStartColor: theme.colors.success },
        error: { borderStartColor: theme.colors.error },
        info: { borderStartColor: theme.colors.info },
        warning: { borderStartColor: theme.colors.warning },
      },
    },
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: MIN_TOUCH_TARGET,
    gap: theme.spacing.md,
    padding: theme.spacing.md,
  },
  body: {
    flex: 1,
    gap: theme.spacing.xxs,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
}));
