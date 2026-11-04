import { zodResolver } from '@hookform/resolvers/zod';
import { screen, waitFor } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Button } from '../Button';

import { FormCheckbox } from './FormCheckbox';

const schema = z.object({ field: z.boolean().refine((isOn) => isOn, 'username.required') });
type FormValues = { field: boolean };

function Harness({ onValid }: Readonly<{ onValid: (values: FormValues) => void }>) {
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { field: false },
  });

  return (
    <>
      <FormCheckbox<FormValues, 'field'> name="field" control={control} label="Accept" />
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

describe('FormCheckbox', () => {
  it('binds the checked state to the form value', async () => {
    const onValid = jest.fn();
    const { user } = await renderWithProviders(<Harness onValid={onValid} />);
    await user.press(screen.getByRole('checkbox', { name: 'Accept' }));
    expect(screen.getByRole('checkbox', { name: 'Accept' })).toBeChecked();
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledWith({ field: true });
    });
  });

  it('shows the translated validation message for the field error', async () => {
    const { user } = await renderWithProviders(<Harness onValid={jest.fn()} />);
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert', { name: 'Enter your username.' })).toBeOnTheScreen();
  });
});

function Extra({ isOn = false, helperText }: Readonly<{ isOn?: boolean; helperText?: string }>) {
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { field: isOn },
  });

  return (
    <>
      <FormCheckbox<FormValues, 'field'>
        name="field"
        control={control}
        label="Accept"
        helperText={helperText}
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

describe('FormCheckbox helper text and error states', () => {
  it('starts from the default value', async () => {
    await renderWithProviders(<Extra isOn />);
    expect(screen.getByRole('checkbox', { name: 'Accept' })).toBeChecked();
  });

  it('shows the helper text until a validation error replaces it', async () => {
    const { user } = await renderWithProviders(<Extra helperText="Required to continue" />);
    expect(screen.getByText('Required to continue')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert', { name: 'Enter your username.' })).toBeOnTheScreen();
    expect(screen.queryByText('Required to continue')).not.toBeOnTheScreen();
  });

  it('clears the error once the field is valid, and brings the helper text back', async () => {
    const { user } = await renderWithProviders(<Extra helperText="Required to continue" />);
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    await user.press(screen.getByRole('checkbox', { name: 'Accept' }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    });
    expect(screen.getByText('Required to continue')).toBeOnTheScreen();
  });

  it('translates the error into Arabic', async () => {
    const { user } = await renderWithProviders(<Extra />, { language: 'ar' });
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert', { name: 'أدخل اسم المستخدم.' })).toBeOnTheScreen();
  });
});
