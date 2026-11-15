import { StyleSheet } from 'react-native-unistyles';

import type { SpacingKey } from '@theme/index';

export const styles = StyleSheet.create((theme) => ({
  stack: (gap: SpacingKey) => ({
    gap: theme.spacing[gap],
  }),
  row: (gap: SpacingKey) => ({
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[gap],
  }),
  cell: (flex: number) => ({
    flex,
  }),
}));
