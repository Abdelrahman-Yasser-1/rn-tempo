import { createContext, use } from 'react';

export type RadioGroupContextValue = {
  value: string | undefined;
  disabled: boolean;
  onChange: (value: string) => void;
};

export const RadioGroupContext = createContext<RadioGroupContextValue | null>(null);

/** Selection state of the enclosing `RadioGroup`, or `null` for a standalone `Radio`. */
export function useRadioGroup() {
  return use(RadioGroupContext);
}
