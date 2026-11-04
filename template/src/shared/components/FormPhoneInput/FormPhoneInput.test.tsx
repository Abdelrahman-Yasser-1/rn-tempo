import { zodResolver } from '@hookform/resolvers/zod';
import { screen, waitFor } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { phoneSchema } from '@shared/utils/schemas';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Button } from '../Button';

import { FormPhoneInput } from './FormPhoneInput';

const schema = z.object({ field: phoneSchema });
type FormValues = { field: string };

function Harness({ onValid }: Readonly<{ onValid: (values: FormValues) => void }>) {
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { field: '' },
  });

  return (
    <>
      <FormPhoneInput<FormValues, 'field'> name="field" control={control} label="Mobile" />
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

describe('FormPhoneInput', () => {
  it('binds the typed number, as E.164, to the form value', async () => {
    const onValid = jest.fn();
    const { user } = await renderWithProviders(<Harness onValid={onValid} />);
    await user.type(screen.getByLabelText('Mobile'), '0512345678');
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledWith({ field: '+966512345678' });
    });
  });

  it('shows the translated validation message for the field error', async () => {
    const { user } = await renderWithProviders(<Harness onValid={jest.fn()} />);
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(
      await screen.findByRole('alert', { name: 'Enter a valid phone number with country code.' }),
    ).toBeOnTheScreen();
  });
});
