import { screen } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Button } from '../Button';

import { FormTextField } from './FormTextField';

type FormValues = { email: string };

function Harness() {
  const { control, setError } = useForm<FormValues>({ defaultValues: { email: '' } });
  return (
    <>
      <FormTextField<FormValues, 'email'> name="email" control={control} label="Email" />
      <Button
        title="Reject"
        onPress={() => {
          setError('email', { message: 'email.required' });
        }}
      />
      <Text>form</Text>
    </>
  );
}

describe('FormTextField', () => {
  it('writes typed text into the react-hook-form value', async () => {
    const { user } = await renderWithProviders(<Harness />);
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    expect(screen.getByLabelText('Email')).toHaveProp('value', 'ada@example.com');
  });

  it('shows the translated validation message for the field error', async () => {
    const { user } = await renderWithProviders(<Harness />);
    await user.press(screen.getByRole('button', { name: 'Reject' }));
    expect(screen.getByRole('alert', { name: 'Enter your email address.' })).toBeOnTheScreen();
  });
});
