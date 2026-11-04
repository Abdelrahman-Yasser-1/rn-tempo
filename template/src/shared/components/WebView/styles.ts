import { StyleSheet } from 'react-native-unistyles';

const BAR_HEIGHT = 3;

export const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  webView: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  track: {
    height: BAR_HEIGHT,
    backgroundColor: theme.colors.divider,
  },
  fill: (progress: number) => ({
    height: BAR_HEIGHT,
    width: `${String(Math.round(progress * 100))}%`,
    backgroundColor: theme.colors.primary,
  }),
  error: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
}));
