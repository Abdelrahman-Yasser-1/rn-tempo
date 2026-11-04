import { zodResolver } from '@hookform/resolvers/zod';
import { screen, waitFor } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Button } from '../Button';

import { FormMapPicker } from './FormMapPicker';

const locationSchema = z.object({ latitude: z.number(), longitude: z.number() });
const schema = z.object({
  field: locationSchema.nullable().refine((value) => value !== null, 'username.required'),
});
type FormValues = { field: z.infer<typeof locationSchema> | null };

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
      <FormMapPicker<FormValues, 'field'> name="field" control={control} label="Pickup" />
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

describe('FormMapPicker', () => {
  it('shows the prefilled location and submits it', async () => {
    const onValid = jest.fn();
    const initial = { latitude: 24.7136, longitude: 46.6753 };
    const { user } = await renderWithProviders(<Harness initial={initial} onValid={onValid} />);
    expect(screen.getByRole('button', { name: 'Pickup' })).toHaveAccessibilityValue({
      text: '24.71360, 46.67530',
    });
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledWith({ field: initial });
    });
  });

  it('shows the translated error when nothing is chosen', async () => {
    const onValid = jest.fn();
    const { user } = await renderWithProviders(<Harness onValid={onValid} />);
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Enter your username.')).toBeOnTheScreen();
    expect(onValid).not.toHaveBeenCalled();
  });
});
