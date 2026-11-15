import { Step } from '@shared/components/Wizard/components/Step';
import { useWizard } from '@shared/components/Wizard/hooks/useWizard';

/** The screen of the wizard. */
export function WizardScreen() {
  return <Step index={useWizard()} />;
}
