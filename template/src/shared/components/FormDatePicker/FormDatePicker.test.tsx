import { zodResolver } from '@hookform/resolvers/zod';
import { screen, waitFor } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { isoDateSchema } from '@shared/utils/schemas';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Button } from '../Button';

import { FormDatePicker } from './FormDatePicker';

const schema = z.object({ field: isoDateSchema });
type FormValues = { field: string };

function Harness({ onValid }: Readonly<{ onValid: (values: FormValues) => void }>) {
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { field: '' },
  });

  return (
    <>
      <FormDatePicker<FormValues, 'field'>
        name="field"
        control={control}
        label="Available from"
        initialMonth="2026-11"
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

describe('FormDatePicker', () => {
  it('binds the confirmed day to the form value', async () => {
    const onValid = jest.fn();
    const { user } = await renderWithProviders(<Harness onValid={onValid} />);
    await user.press(screen.getByRole('button', { name: 'Wednesday, November 18, 2026' }));
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    expect(screen.getByRole('button', { name: 'Available from' })).toHaveAccessibilityValue({
      text: 'Nov 18, 2026',
    });
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledWith({ field: '2026-11-18' });
    });
  });

  it('shows the translated validation message for the field error', async () => {
    const { user } = await renderWithProviders(<Harness onValid={jest.fn()} />);
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Enter a valid date.')).toBeOnTheScreen();
  });
});
