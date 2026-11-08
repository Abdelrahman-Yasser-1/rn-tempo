import { zodResolver } from '@hookform/resolvers/zod';
import { screen, waitFor } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@shared/components/Button';
import { phoneSchema } from '@shared/utils/schemas';
import { renderWithProviders } from '@test-utils/renderWithProviders';

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

function Extra({
  defaultValue = '',
  onValid,
}: Readonly<{ defaultValue?: string; onValid?: (values: FormValues) => void }>) {
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { field: defaultValue },
  });

  return (
    <>
      <FormPhoneInput<FormValues, 'field'> name="field" control={control} label="Mobile" />
      <Button
        title="Submit"
        onPress={() => {
          void handleSubmit((values) => {
            onValid?.(values);
          })();
        }}
      />
    </>
  );
}

describe('FormPhoneInput default, country and error states', () => {
  it('splits an E.164 default value into the country and the number', async () => {
    await renderWithProviders(<Extra defaultValue="+201001234567" />);
    expect(screen.getByRole('combobox', { name: 'Country' })).toHaveAccessibilityValue({
      text: 'Egypt, +20',
    });
    expect(screen.getByLabelText('Mobile')).toHaveDisplayValue('1001234567');
  });

  it('keeps the form value E.164 when the country changes', async () => {
    const onValid = jest.fn();
    const { user } = await renderWithProviders(
      <Extra defaultValue="+966512345678" onValid={onValid} />,
    );
    await user.press(screen.getByRole('radio', { name: 'Albania, +355' }));
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledWith({ field: '+355512345678' });
    });
  });

  it('clears the error once the number is valid', async () => {
    const { user } = await renderWithProviders(<Extra />);
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Mobile'), '512345678');
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    });
  });

  it('translates the error into Arabic', async () => {
    const { user } = await renderWithProviders(<Extra />, { language: 'ar' });
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(
      await screen.findByRole('alert', { name: 'أدخل رقم هاتف صالحًا مع رمز الدولة.' }),
    ).toBeOnTheScreen();
  });
});
