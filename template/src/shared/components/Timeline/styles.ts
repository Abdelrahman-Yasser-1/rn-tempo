import { StyleSheet } from 'react-native-unistyles';

const MARKER = 24;

export const styles = StyleSheet.create((theme) => ({
  item: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  rail: {
    alignItems: 'center',
  },
  marker: {
    width: MARKER,
    height: MARKER,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.full,
    borderWidth: 2,
    variants: {
      status: {
        done: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary },
        current: { borderColor: theme.colors.primary, backgroundColor: theme.colors.background },
        upcoming: { borderColor: theme.colors.border, backgroundColor: theme.colors.background },
      },
    },
  },
  currentDot: {
    width: theme.spacing.sm,
    height: theme.spacing.sm,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
  },
  connector: {
    flex: 1,
    width: 2,
    minHeight: theme.spacing.lg,
    variants: {
      status: {
        done: { backgroundColor: theme.colors.primary },
        current: { backgroundColor: theme.colors.border },
        upcoming: { backgroundColor: theme.colors.border },
      },
    },
  },
  content: {
    flex: 1,
    gap: theme.spacing.xxs,
    paddingBottom: theme.spacing.xl,
  },
  lastContent: {
    paddingBottom: theme.spacing.none,
  },
}));
