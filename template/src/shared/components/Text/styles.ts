import { StyleSheet } from 'react-native-unistyles';

import type { ColorTokens } from '@theme/tokens';

export const styles = StyleSheet.create((theme, rt) => ({
  text: {
    variants: {
      variant: {
        display: theme.typography.display,
        h1: theme.typography.h1,
        h2: theme.typography.h2,
        h3: theme.typography.h3,
        title: theme.typography.title,
        body: theme.typography.body,
        bodyStrong: theme.typography.bodyStrong,
        bodySmall: theme.typography.bodySmall,
        label: theme.typography.label,
        caption: theme.typography.caption,
        button: theme.typography.button,
      },
      align: {
        // `auto` follows the writing direction; `end` needs the runtime RTL flag (no logical value exists).
        start: { textAlign: 'auto' },
        center: { textAlign: 'center' },
        end: { textAlign: rt.rtl ? 'left' : 'right' },
      },
    },
  },
  color: (color: keyof ColorTokens) => ({ color: theme.colors[color] }),
}));
