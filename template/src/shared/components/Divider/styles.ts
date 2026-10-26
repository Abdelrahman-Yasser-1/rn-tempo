import { StyleSheet } from 'react-native-unistyles';

import type { ColorTokens, SpacingKey } from '@theme/tokens';

export const styles = StyleSheet.create((theme) => ({
  divider: (
    orientation: 'horizontal' | 'vertical',
    color: keyof ColorTokens,
    spacing: SpacingKey,
  ) =>
    orientation === 'horizontal'
      ? {
          height: StyleSheet.hairlineWidth,
          alignSelf: 'stretch' as const,
          marginVertical: theme.spacing[spacing],
          backgroundColor: theme.colors[color],
        }
      : {
          width: StyleSheet.hairlineWidth,
          alignSelf: 'stretch' as const,
          marginHorizontal: theme.spacing[spacing],
          backgroundColor: theme.colors[color],
        },
}));
