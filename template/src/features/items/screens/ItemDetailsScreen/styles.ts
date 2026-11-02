import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  content: {
    flexGrow: 1,
    gap: theme.spacing.md,
  },
  body: {
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  facts: {
    gap: theme.spacing.xs,
  },
}));
