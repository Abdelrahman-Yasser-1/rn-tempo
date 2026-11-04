import { zodResolver } from '@hookform/resolvers/zod';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { otpSchema } from '@shared/utils/schemas';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Button } from '../Button';

import { FormOtpInput } from './FormOtpInput';

const schema = z.object({ field: otpSchema });
type FormValues = { field: string };

function Harness({ onValid }: Readonly<{ onValid: (values: FormValues) => void }>) {
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { field: '' },
  });

  return (
    <>
      <FormOtpInput<FormValues, 'field'> name="field" control={control} testID="otp" />
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

describe('FormOtpInput', () => {
  it('binds the typed code to the form value', async () => {
    const onValid = jest.fn();
    const { user } = await renderWithProviders(<Harness onValid={onValid} />);
    // A pasted or autofilled code lands in the first cell and spreads over the others.
    // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
    await fireEvent.changeText(screen.getByLabelText('Digit 1 of 6'), '123456');
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledWith({ field: '123456' });
    });
  });

  it('shows the translated validation message for the field error', async () => {
    const { user } = await renderWithProviders(<Harness onValid={jest.fn()} />);
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert', { name: 'Enter the 6-digit code.' })).toBeOnTheScreen();
  });
});

function Extra({ defaultValue = '' }: Readonly<{ defaultValue?: string }>) {
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { field: defaultValue },
  });

  return (
    <>
      <FormOtpInput<FormValues, 'field'> name="field" control={control} testID="otp" />
      <Button
        title="Submit"
        onPress={() => {
          void handleSubmit(jest.fn())();
        }}
      />
    </>
  );
}

describe('FormOtpInput default and error states', () => {
  it('starts from the default code', async () => {
    await renderWithProviders(<Extra defaultValue="123456" />);
    expect(screen.getByLabelText('Digit 1 of 6')).toHaveDisplayValue('1');
    expect(screen.getByLabelText('Digit 6 of 6')).toHaveDisplayValue('6');
  });

  it('keeps the error while the code is incomplete and clears it once it is complete', async () => {
    const { user } = await renderWithProviders(<Extra />);
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert', { name: 'Enter the 6-digit code.' })).toBeOnTheScreen();
    // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
    await fireEvent.changeText(screen.getByLabelText('Digit 1 of 6'), '123');
    expect(await screen.findByRole('alert', { name: 'Enter the 6-digit code.' })).toBeOnTheScreen();
    // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
    await fireEvent.changeText(screen.getByLabelText('Digit 1 of 6'), '123456');
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    });
  });

  it('translates the error into Arabic', async () => {
    const { user } = await renderWithProviders(<Extra />, { language: 'ar' });
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(
      await screen.findByRole('alert', { name: 'أدخل الرمز المكوّن من 6 أرقام.' }),
    ).toBeOnTheScreen();
  });
});
