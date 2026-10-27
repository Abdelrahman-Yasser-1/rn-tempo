import { StyleSheet } from 'react-native-unistyles';

import type { SpacingKey } from '@theme/tokens';

export const styles = StyleSheet.create((theme) => ({
  spacer: (size: SpacingKey, isHorizontal: boolean) =>
    isHorizontal ? { width: theme.spacing[size] } : { height: theme.spacing[size] },
}));
