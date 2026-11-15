import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  header: {
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.lg,
  },
  navigation: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingTop: theme.spacing.xl,
  },
  action: {
    flex: 1,
  },
}));
