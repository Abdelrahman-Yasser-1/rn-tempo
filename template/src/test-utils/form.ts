import { act } from '@testing-library/react-native';
import type { Control, FieldValues, Path } from 'react-hook-form';

/** Sets react-hook-form fields through the control, the way a text input's change event would. */
export async function fillFields<Values extends FieldValues>(
  control: Control<Values>,
  values: Readonly<Partial<Record<Path<Values>, string>>>,
): Promise<void> {
  await act(async () => {
    for (const [name, value] of Object.entries(values)) {
      await control
        .register(name as Path<Values>)
        .onChange({ target: { name, value }, type: 'change' });
    }
  });
}
