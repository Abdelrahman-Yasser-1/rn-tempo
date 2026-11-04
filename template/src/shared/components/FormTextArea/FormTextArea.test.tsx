import { screen } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { FormTextArea } from './FormTextArea';

type FormValues = { notes: string };

function Harness() {
  const { control } = useForm<FormValues>({ defaultValues: { notes: '' } });
  return <FormTextArea<FormValues, 'notes'> name="notes" control={control} label="Notes" />;
}

describe('FormTextArea', () => {
  it('writes typed text into the react-hook-form value', async () => {
    const { user } = await renderWithProviders(<Harness />);
    await user.type(screen.getByLabelText('Notes'), 'hello');
    expect(screen.getByLabelText('Notes')).toHaveProp('value', 'hello');
  });
});
