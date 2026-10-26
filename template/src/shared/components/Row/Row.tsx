import { Box } from '../Box';
import type { StackProps } from '../Box';

/** Row: a Box with `flexDirection: row`; `align` and `justify` use friendly names. */
export function Row(props: StackProps) {
  return <Box {...props} direction="row" />;
}
