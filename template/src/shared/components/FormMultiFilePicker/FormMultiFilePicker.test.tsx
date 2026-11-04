import { zodResolver } from '@hookform/resolvers/zod';
import { screen, waitFor } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Button } from '../Button';

import { FormMultiFilePicker } from './FormMultiFilePicker';

const fileSchema = z.object({
  uri: z.string(),
  name: z.string(),
  type: z.string(),
  size: z.number(),
});
const schema = z.object({ field: z.array(fileSchema).min(1, 'username.required') });
type FormValues = { field: z.infer<typeof fileSchema>[] };

const files = [
  { uri: 'file:///a.pdf', name: 'a.pdf', type: 'application/pdf', size: 10 },
  { uri: 'file:///b.pdf', name: 'b.pdf', type: 'application/pdf', size: 20 },
];

function Harness({
  onValid,
  initial = [],
}: Readonly<{ onValid: (values: FormValues) => void; initial?: FormValues['field'] }>) {
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { field: initial },
  });

  return (
    <>
      <FormMultiFilePicker<FormValues, 'field'>
        name="field"
        control={control}
        label="Attachments"
      />
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

describe('FormMultiFilePicker', () => {
  it('submits the prefilled list minus a removed file', async () => {
    const onValid = jest.fn();
    const { user } = await renderWithProviders(<Harness initial={files} onValid={onValid} />);
    await user.press(screen.getByRole('button', { name: 'Remove a.pdf' }));
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledWith({ field: [files[1]] });
    });
  });

  it('shows the translated error for an empty list', async () => {
    const { user } = await renderWithProviders(<Harness onValid={jest.fn()} />);
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Enter your username.')).toBeOnTheScreen();
  });
});
