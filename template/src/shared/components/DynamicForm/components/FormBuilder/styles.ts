import { StyleSheet } from 'react-native-unistyles';

import type { SpacingKey } from '@theme/index';

export const styles = StyleSheet.create((theme) => ({
  container: (gap: SpacingKey) => ({
    gap: theme.spacing[gap],
  }),
}));
