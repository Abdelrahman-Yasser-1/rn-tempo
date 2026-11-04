import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  stepper: {
    paddingBottom: theme.spacing.xl,
  },
  footer: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  action: {
    flex: 1,
  },
}));
