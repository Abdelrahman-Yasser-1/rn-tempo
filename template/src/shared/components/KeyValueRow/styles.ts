import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  root: {
    paddingVertical: theme.spacing.md,
    variants: {
      layout: {
        horizontal: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: theme.spacing.lg,
        },
        vertical: { gap: theme.spacing.xs },
      },
    },
  },
  label: {
    variants: {
      layout: {
        horizontal: { flex: 1 },
        vertical: {},
      },
    },
  },
  value: {
    variants: {
      layout: {
        horizontal: { flex: 1, alignItems: 'flex-end' },
        vertical: { alignItems: 'flex-start' },
      },
    },
  },
}));
