import { createContext, use, useMemo } from 'react';

import { Box } from '../Box';

import { styles } from './styles';
import type { RadioGroupContextValue, RadioGroupProps } from './types';

const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

/** Selection state of the enclosing `RadioGroup`, or `null` for a standalone `Radio`. */
export function useRadioGroup() {
  return use(RadioGroupContext);
}

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
