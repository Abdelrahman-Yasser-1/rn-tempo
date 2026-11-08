import { zodResolver } from '@hookform/resolvers/zod';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@shared/components/Button';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { FormNumberInput } from './FormNumberInput';

const schema = z.object({ field: z.number().min(2, 'username.required') });
type FormValues = { field: number };

function Harness({ onValid }: Readonly<{ onValid: (values: FormValues) => void }>) {
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { field: 1 },
  });

  return (
    <>
      <FormNumberInput<FormValues, 'field'>
        name="field"
        control={control}
        label="Quantity"
        min={1}
        max={5}
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

describe('FormNumberInput', () => {
  it('binds the stepped value to the form value', async () => {
    const onValid = jest.fn();
    const { user } = await renderWithProviders(<Harness onValid={onValid} />);
    await user.press(screen.getByRole('button', { name: 'Increase' }));
    expect(screen.getByRole('adjustable', { name: 'Quantity' })).toHaveDisplayValue('2');
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledWith({ field: 2 });
    });
  });

  it('shows the translated validation message for the field error', async () => {
    const { user } = await renderWithProviders(<Harness onValid={jest.fn()} />);
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert', { name: 'Enter your username.' })).toBeOnTheScreen();
  });
});

function Extra({
  defaultValue = 1,
  onValid,
}: Readonly<{ defaultValue?: number; onValid?: (values: FormValues) => void }>) {
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { field: defaultValue },
  });

  return (
    <>
      <FormNumberInput<FormValues, 'field'>
        name="field"
        control={control}
        label="Quantity"
        min={1}
        max={5}
      />
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

describe('FormNumberInput default, clamping and error states', () => {
  it('starts from the default value', async () => {
    await renderWithProviders(<Extra defaultValue={4} />);
    expect(screen.getByRole('adjustable', { name: 'Quantity' })).toHaveDisplayValue('4');
  });

  it('puts a typed number, clamped to the bounds, into the form value', async () => {
    const onValid = jest.fn();
    const { user } = await renderWithProviders(<Extra defaultValue={3} onValid={onValid} />);
    const input = screen.getByRole('adjustable', { name: 'Quantity' });
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, '99');
    await fireEvent(input, 'blur');
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledWith({ field: 5 });
    });
  });

  it('clears the error once the value is valid', async () => {
    const { user } = await renderWithProviders(<Extra />);
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Increase' }));
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
