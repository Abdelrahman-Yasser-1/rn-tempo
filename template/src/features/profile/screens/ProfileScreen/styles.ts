import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  content: {
    flexGrow: 1,
    gap: theme.spacing.md,
  },
  body: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.xl,
  },
  details: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
}));
