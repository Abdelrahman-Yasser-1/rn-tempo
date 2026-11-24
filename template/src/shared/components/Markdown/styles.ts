import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  root: {
    gap: theme.spacing.md,
  },
  list: {
    gap: theme.spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  marker: {
    minWidth: theme.spacing.xl,
  },
  itemText: {
    flex: 1,
  },
  italic: {
    fontStyle: 'italic',
  },
  code: {
    backgroundColor: theme.colors.surfaceVariant,
  },
  link: {
    textDecorationLine: 'underline',
  },
}));
