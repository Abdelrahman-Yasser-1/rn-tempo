import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  search: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
  },
  body: {
    flex: 1,
  },
  footer: {
    paddingVertical: theme.spacing.lg,
  },
}));
