import { zodResolver } from '@hookform/resolvers/zod';
import { screen, waitFor } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Button } from '../Button';

import { FormFilePicker } from './FormFilePicker';

const fileSchema = z.object({
  uri: z.string(),
  name: z.string(),
  type: z.string(),
  size: z.number(),
});
const schema = z.object({
  field: fileSchema.nullable().refine((value) => value !== null, 'username.required'),
});
type FormValues = { field: z.infer<typeof fileSchema> | null };

const prefilled = {
  uri: 'file:///c.pdf',
  name: 'contract.pdf',
  type: 'application/pdf',
  size: 2048,
};

function Harness({
  onValid,
  initial = null,
}: Readonly<{ onValid: (values: FormValues) => void; initial?: FormValues['field'] }>) {
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { field: initial },
  });

  return (
    <>
      <FormFilePicker<FormValues, 'field'> name="field" control={control} label="Attachment" />
      <Button
        title="Submit"
        onPress={() => {
          void handleSubmit((values) => {
            onValid(values);
          })();
        }}
      />
    </>
  );
}

describe('FormFilePicker', () => {
  it('shows the prefilled file and submits it', async () => {
    const onValid = jest.fn();
    const { user } = await renderWithProviders(<Harness initial={prefilled} onValid={onValid} />);
    expect(screen.getByText('contract.pdf')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledWith({ field: prefilled });
    });
  });

  it('removes the file into the form value and shows the translated error', async () => {
    const onValid = jest.fn();
    const { user } = await renderWithProviders(<Harness initial={prefilled} onValid={onValid} />);
    await user.press(screen.getByRole('button', { name: 'Remove contract.pdf' }));
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Enter your username.')).toBeOnTheScreen();
    expect(onValid).not.toHaveBeenCalled();
  });
});
