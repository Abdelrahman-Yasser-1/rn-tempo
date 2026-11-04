import { zodResolver } from '@hookform/resolvers/zod';
import { screen, waitFor } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Button } from '../Button';

import { FormTimeSlot } from './FormTimeSlot';

const schema = z.object({ field: z.string().min(1, 'username.required') });
type FormValues = { field: string };

function Harness({ onValid }: Readonly<{ onValid: (values: FormValues) => void }>) {
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { field: '' },
  });

  return (
    <>
      <FormTimeSlot<FormValues, 'field'>
        name="field"
        control={control}
        label="Pickup slot"
        slots={[{ value: '09:00', label: 'Nine' }, { value: '13:00' }]}
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

describe('FormTimeSlot', () => {
  it('binds the chosen slot to the form value', async () => {
    const onValid = jest.fn();
    const { user } = await renderWithProviders(<Harness onValid={onValid} />);
    await user.press(screen.getByRole('button', { name: 'Pickup slot' }));
    await user.press(screen.getByRole('button', { name: 'Nine' }));
    expect(screen.getByRole('button', { name: 'Pickup slot' })).toHaveAccessibilityValue({
      text: 'Nine',
    });
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledWith({ field: '09:00' });
    });
  });

  it('shows the translated validation message for the field error', async () => {
    const { user } = await renderWithProviders(<Harness onValid={jest.fn()} />);
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Enter your username.')).toBeOnTheScreen();
  });
});
