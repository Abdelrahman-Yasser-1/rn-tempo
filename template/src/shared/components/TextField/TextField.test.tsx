import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { TextField } from './TextField';

describe('TextField', () => {
  it('labels the input with its label', async () => {
    await renderWithProviders(<TextField label="Email" onChangeText={jest.fn()} />);
    expect(screen.getByLabelText('Email')).toBeOnTheScreen();
    expect(screen.getByText('Email')).toBeOnTheScreen();
  });

  it('prefers accessibilityLabel over the visible label', async () => {
    await renderWithProviders(
      <TextField label="Email" accessibilityLabel="Work email" onChangeText={jest.fn()} />,
    );
    expect(screen.getByLabelText('Work email')).toBeOnTheScreen();
  });

  it('reports typed text through onChangeText', async () => {
    const onChangeText = jest.fn();
    const { user } = await renderWithProviders(
      <TextField label="Name" onChangeText={onChangeText} />,
    );
    await user.type(screen.getByLabelText('Name'), 'Ada');
    expect(onChangeText).toHaveBeenLastCalledWith('Ada');
  });

  it('shows the helper text when there is no error', async () => {
    await renderWithProviders(
      <TextField label="Phone" helperText="Include the country code" onChangeText={jest.fn()} />,
    );
    expect(screen.getByText('Include the country code')).toBeOnTheScreen();
  });

  it('replaces the helper text with an announced error', async () => {
    await renderWithProviders(
      <TextField
        label="Phone"
        helperText="Include the country code"
        errorText="Phone number is required"
        onChangeText={jest.fn()}
      />,
    );
    expect(screen.queryByText('Include the country code')).not.toBeOnTheScreen();
    expect(screen.getByRole('alert', { name: 'Phone number is required' })).toBeOnTheScreen();
  });

  it('is not editable when disabled', async () => {
    await renderWithProviders(<TextField label="Locked" disabled onChangeText={jest.fn()} />);
    expect(screen.getByLabelText('Locked')).toHaveProp('editable', false);
  });

  it('masks secure text and toggles visibility from the eye button', async () => {
    const { user } = await renderWithProviders(
      <TextField label="Password" secureTextEntry onChangeText={jest.fn()} />,
    );
    const input = screen.getByLabelText('Password');
    expect(input).toHaveProp('secureTextEntry', true);

    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveProp('accessibilityState', expect.objectContaining({ checked: false }));
    await user.press(toggle);

    expect(screen.getByLabelText('Password')).toHaveProp('secureTextEntry', false);
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: true }),
    );
  });

  it('does not render a visibility toggle for plain inputs', async () => {
    await renderWithProviders(<TextField label="City" onChangeText={jest.fn()} />);
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });
});
