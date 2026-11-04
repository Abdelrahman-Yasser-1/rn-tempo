import { zodResolver } from '@hookform/resolvers/zod';
import { screen, waitFor } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Button } from '../Button';

import { FormSelect } from './FormSelect';

const schema = z.object({ field: z.string().min(1, 'username.required') });
type FormValues = { field: string };

function Harness({ onValid }: Readonly<{ onValid: (values: FormValues) => void }>) {
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { field: '' },
  });

  return (
    <>
      <FormSelect<FormValues, 'field'>
        name="field"
        control={control}
        label="Plan"
        options={[
          { value: 'free', label: 'Free' },
          { value: 'pro', label: 'Pro' },
        ]}
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

describe('FormSelect', () => {
  it('binds the chosen option to the form value', async () => {
    const onValid = jest.fn();
    const { user } = await renderWithProviders(<Harness onValid={onValid} />);
    await user.press(screen.getByRole('radio', { name: 'Pro' }));
    expect(screen.getByRole('combobox', { name: 'Plan' })).toHaveAccessibilityValue({
      text: 'Pro',
    });
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledWith({ field: 'pro' });
    });
  });

  it('shows the translated validation message for the field error', async () => {
    const { user } = await renderWithProviders(<Harness onValid={jest.fn()} />);
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert', { name: 'Enter your username.' })).toBeOnTheScreen();
  });
});

function Extra({ defaultValue = '' }: Readonly<{ defaultValue?: string }>) {
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { field: defaultValue },
  });

  return (
    <>
      <FormSelect<FormValues, 'field'>
        name="field"
        control={control}
        label="Plan"
        options={[
          { value: 'free', label: 'Free' },
          { value: 'pro', label: 'Pro' },
        ]}
      />
      <Button
        title="Submit"
        onPress={() => {
          void handleSubmit(jest.fn())();
        }}
      />
    </>
  );
}

describe('FormSelect default and error states', () => {
  it('starts from the default value', async () => {
    await renderWithProviders(<Extra defaultValue="pro" />);
    expect(screen.getByRole('combobox', { name: 'Plan' })).toHaveAccessibilityValue({
      text: 'Pro',
    });
  });

  it('clears the error once an option is chosen', async () => {
    const { user } = await renderWithProviders(<Extra />);
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    await user.press(screen.getByRole('radio', { name: 'Free' }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    });
  });

  it('translates the error into Arabic', async () => {
    const { user } = await renderWithProviders(<Extra />, { language: 'ar' });
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert', { name: 'أدخل اسم المستخدم.' })).toBeOnTheScreen();
  });
});
