import { StyleSheet } from 'react-native-unistyles';

import type { SpacingKey } from '@theme/tokens';

export const styles = StyleSheet.create((theme) => ({
  flex: {
    flex: 1,
  },
  content: (padding: SpacingKey) => ({
    flex: 1,
    padding: theme.spacing[padding],
  }),
  scrollContent: (padding: SpacingKey) => ({
    flexGrow: 1,
    padding: theme.spacing[padding],
  }),
  footer: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.divider,
    backgroundColor: theme.colors.background,
  },
}));
