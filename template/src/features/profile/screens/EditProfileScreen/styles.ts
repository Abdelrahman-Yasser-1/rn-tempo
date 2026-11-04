import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  content: {
    flexGrow: 1,
    gap: theme.spacing.lg,
  },
  // The Header pads itself; the form below it gets the screen gutter.
  body: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
}));
