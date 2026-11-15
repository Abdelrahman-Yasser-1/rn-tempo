import { useState } from 'react';

import { FIRST_STEP } from '@shared/components/Wizard/constants';

/** The current step of the wizard. */
export function useWizard(): number {
  const [step] = useState(FIRST_STEP);
  return step;
}
