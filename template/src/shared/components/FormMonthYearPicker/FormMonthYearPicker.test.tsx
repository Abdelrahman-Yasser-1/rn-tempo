import { zodResolver } from '@hookform/resolvers/zod';
import { screen, waitFor } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@shared/components/Button';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { FormMonthYearPicker } from './FormMonthYearPicker';

const schema = z.object({ field: z.string().min(1, 'username.required') });
type FormValues = { field: string };

function Harness({
  onValid,
  initial,
}: Readonly<{ onValid: (values: FormValues) => void; initial: string }>) {
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { field: initial },
  });

  return (
    <>
      <FormMonthYearPicker<FormValues, 'field'>
        name="field"
        control={control}
        label="Statement month"
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

describe('FormMonthYearPicker', () => {
  it('binds the confirmed month to the form value', async () => {
    const onValid = jest.fn();
    const { user } = await renderWithProviders(<Harness onValid={onValid} initial="2026-11" />);
    await user.press(screen.getByRole('button', { name: 'Statement month' }));
    await user.press(screen.getByRole('button', { name: 'March 2026' }));
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledWith({ field: '2026-03' });
    });
  });

  it('shows the translated validation message when the field is empty', async () => {
    const { user } = await renderWithProviders(<Harness onValid={jest.fn()} initial="" />);
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Enter your username.')).toBeOnTheScreen();
  });

  it('shows the prefilled month formatted', async () => {
    await renderWithProviders(<Harness onValid={jest.fn()} initial="2026-11" />);
    expect(screen.getByRole('button', { name: 'Statement month' })).toHaveAccessibilityValue({
      text: 'November 2026',
    });
  });

  it('translates the validation message to Arabic', async () => {
    const { user } = await renderWithProviders(<Harness onValid={jest.fn()} initial="" />, {
      language: 'ar',
    });
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('أدخل اسم المستخدم.')).toBeOnTheScreen();
  });
});
