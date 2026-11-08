import { Box } from '@shared/components/Box';
import type { StackProps } from '@shared/components/Box';

/** Column: a Box with `flexDirection: column`; `align` and `justify` use friendly names. */
export function Column(props: StackProps) {
  return <Box {...props} direction="column" />;
}
