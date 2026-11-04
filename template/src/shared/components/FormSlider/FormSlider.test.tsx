import { zodResolver } from '@hookform/resolvers/zod';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Button } from '../Button';

import { FormSlider } from './FormSlider';

const schema = z.object({ field: z.number().min(30, 'username.required') });
type FormValues = { field: number };

function Harness({ onValid }: Readonly<{ onValid: (values: FormValues) => void }>) {
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { field: 20 },
  });

  return (
    <>
      <FormSlider<FormValues, 'field'>
        name="field"
        control={control}
        label="Volume"
        min={0}
        max={100}
        step={10}
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

describe('FormSlider', () => {
  it('binds the stepped value to the form value', async () => {
    const onValid = jest.fn();
    const { user } = await renderWithProviders(<Harness onValid={onValid} />);
    // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
    await fireEvent(
      screen.getByRole('adjustable', { name: 'Volume' }),
      'RNCSliderAccessibilityAction',
      {
        nativeEvent: { actionName: 'increment' },
      },
    );
    expect(screen.getByRole('adjustable', { name: 'Volume' })).toHaveAccessibilityValue({
      now: 30,
    });
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledWith({ field: 30 });
    });
  });

  it('shows the translated validation message for the field error', async () => {
    const { user } = await renderWithProviders(<Harness onValid={jest.fn()} />);
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert', { name: 'Enter your username.' })).toBeOnTheScreen();
  });
});

function Extra({ defaultValue = 20 }: Readonly<{ defaultValue?: number }>) {
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { field: defaultValue },
  });

  return (
    <>
      <FormSlider<FormValues, 'field'>
        name="field"
        control={control}
        label="Volume"
        min={0}
        max={100}
        step={10}
        showValue
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

describe('FormSlider default and error states', () => {
  it('starts from the default value', async () => {
    await renderWithProviders(<Extra defaultValue={70} />);
    expect(screen.getByRole('adjustable', { name: 'Volume' })).toHaveAccessibilityValue({
      now: 70,
    });
  });

  it('writes a dragged value to the form', async () => {
    await renderWithProviders(<Extra />);
    // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
    await fireEvent(screen.getByRole('adjustable', { name: 'Volume' }), 'valueChange', 60);
    expect(screen.getByRole('adjustable', { name: 'Volume' })).toHaveAccessibilityValue({
      now: 60,
    });
    expect(screen.getByText('60')).toBeOnTheScreen();
  });

  it('clears the error once the value is valid', async () => {
    const { user } = await renderWithProviders(<Extra />);
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    // eslint-disable-next-line testing-library/no-await-sync-events -- RNTL 14 fireEvent is async
    await fireEvent(screen.getByRole('adjustable', { name: 'Volume' }), 'valueChange', 50);
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
