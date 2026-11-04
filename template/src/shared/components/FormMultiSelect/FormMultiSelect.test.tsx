import { zodResolver } from '@hookform/resolvers/zod';
import { screen, waitFor } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Button } from '../Button';

import { FormMultiSelect } from './FormMultiSelect';

const schema = z.object({ field: z.array(z.string()).min(1, 'username.required') });
type FormValues = { field: string[] };

function Harness({ onValid }: Readonly<{ onValid: (values: FormValues) => void }>) {
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { field: [] },
  });

  return (
    <>
      <FormMultiSelect<FormValues, 'field'>
        name="field"
        control={control}
        label="Tags"
        options={[
          { value: 'new', label: 'New' },
          { value: 'sale', label: 'Sale' },
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

describe('FormMultiSelect', () => {
  it('binds the checked options to the form value', async () => {
    const onValid = jest.fn();
    const { user } = await renderWithProviders(<Harness onValid={onValid} />);
    await user.press(screen.getByRole('checkbox', { name: 'New' }));
    await user.press(screen.getByRole('checkbox', { name: 'Sale' }));
    expect(screen.getByRole('combobox', { name: 'Tags' })).toHaveAccessibilityValue({
      text: 'New, Sale',
    });
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(onValid).toHaveBeenCalledWith({ field: ['new', 'sale'] });
    });
  });

  it('shows the translated validation message for the field error', async () => {
    const { user } = await renderWithProviders(<Harness onValid={jest.fn()} />);
    await user.press(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByRole('alert', { name: 'Enter your username.' })).toBeOnTheScreen();
  });
});
