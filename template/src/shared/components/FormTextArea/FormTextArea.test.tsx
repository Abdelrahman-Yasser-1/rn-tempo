import { zodResolver } from '@hookform/resolvers/zod';
import { screen } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@shared/components/Button';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { FormTextArea } from './FormTextArea';

const noop = () => {
  // nothing to do on a valid submit
};

const schema = z.object({ notes: z.string().min(1, 'email.required') });

type FormValues = { notes: string };

function Harness() {
  const { control } = useForm<FormValues>({ defaultValues: { notes: '' } });
  return <FormTextArea<FormValues, 'notes'> name="notes" control={control} label="Notes" />;
}

function ValidatedHarness() {
  const { control, handleSubmit } = useForm<FormValues>({
    defaultValues: { notes: '' },
    resolver: zodResolver(schema),
  });
  return (
    <>
      <FormTextArea<FormValues, 'notes'>
        name="notes"
        control={control}
        label="Notes"
        maxLength={20}
      />
      <Button
        title="Submit"
        onPress={() => {
          void handleSubmit(noop)();
        }}
      />
    </>
  );
}

describe('FormTextArea', () => {
  it('writes typed text into the react-hook-form value', async () => {
    const { user } = await renderWithProviders(<Harness />);
    await user.type(screen.getByLabelText('Notes'), 'hello');
    expect(screen.getByLabelText('Notes')).toHaveProp('value', 'hello');
  });

  it('shows the counter for the form value', async () => {
    const { user } = await renderWithProviders(<ValidatedHarness />);
    expect(screen.getByText('0/20')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Notes'), 'hey');
    expect(screen.getByText('3/20')).toBeOnTheScreen();
  });

  it('shows the translated Zod error after submitting an invalid value', async () => {
    const { user } = await renderWithProviders(<ValidatedHarness />);
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(
      await screen.findByRole('alert', { name: 'Enter your email address.' }),
    ).toBeOnTheScreen();
  });
});
