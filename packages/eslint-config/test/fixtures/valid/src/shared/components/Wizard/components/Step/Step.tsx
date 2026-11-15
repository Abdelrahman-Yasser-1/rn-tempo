import { Text } from 'react-native';

import { nextStep } from '@shared/components/Wizard/utils/steps';

/** One step of the wizard. */
export function Step({ index }: Readonly<{ index: number }>) {
  return <Text>{String(nextStep(index))}</Text>;
}
