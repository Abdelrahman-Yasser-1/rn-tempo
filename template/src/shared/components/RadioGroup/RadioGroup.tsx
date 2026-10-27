import { useMemo } from 'react';

import { Box } from '../Box';

import { RadioGroupContext } from './RadioGroupContext';
import { styles } from './styles';
import type { RadioGroupProps } from './types';

/** Groups `Radio` options; only the option matching `value` is selected. */
export function RadioGroup({
  value,
  onChange,
  disabled: isDisabled = false,
  children,
  ...rest
}: RadioGroupProps) {
  const context = useMemo(
    () => ({ value, onChange, disabled: isDisabled }),
    [value, onChange, isDisabled],
  );

  return (
    <RadioGroupContext value={context}>
      <Box accessibilityRole="radiogroup" {...rest} style={styles.root}>
        {children}
      </Box>
    </RadioGroupContext>
  );
}
