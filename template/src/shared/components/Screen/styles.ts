import { StyleSheet } from 'react-native-unistyles';

import type { SpacingKey } from '@theme/tokens';

export const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: {
    flex: 1,
  },
  content: (padding: SpacingKey) => ({
    padding: theme.spacing[padding],
  }),
  scrollContent: (padding: SpacingKey) => ({
    flexGrow: 1,
    padding: theme.spacing[padding],
  }),
}));
