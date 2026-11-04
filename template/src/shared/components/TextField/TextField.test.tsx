import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

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

  it('shows a string prefix and suffix around the input', async () => {
    await renderWithProviders(
      <TextField label="Amount" prefix="+20" suffix="EGP" onChangeText={jest.fn()} />,
    );
    expect(screen.getByText('+20')).toBeOnTheScreen();
    expect(screen.getByText('EGP')).toBeOnTheScreen();
  });

  it('renders a node prefix and suffix as given', async () => {
    await renderWithProviders(
      <TextField
        label="Amount"
        prefix={<Text>flag</Text>}
        suffix={<Text>unit</Text>}
        onChangeText={jest.fn()}
      />,
    );
    expect(screen.getByText('flag')).toBeOnTheScreen();
    expect(screen.getByText('unit')).toBeOnTheScreen();
  });

  it('renders no affix for an empty prefix or suffix', async () => {
    await renderWithProviders(
      <TextField label="Amount" prefix="" suffix={null} onChangeText={jest.fn()} />,
    );
    expect(screen.getByLabelText('Amount')).toBeOnTheScreen();
  });

  it('is read only: not editable and ignores typing', async () => {
    const onChangeText = jest.fn();
    const { user } = await renderWithProviders(
      <TextField label="Id" readOnly value="A-1" onChangeText={onChangeText} />,
    );
    const input = screen.getByLabelText('Id');
    expect(input).toHaveProp('readOnly', true);
    expect(input).toHaveProp('editable', false);
    await user.type(input, 'x');
    expect(onChangeText).not.toHaveBeenCalled();
  });

  it('passes required through to the label with a sub label and tooltip', async () => {
    const { user } = await renderWithProviders(
      <TextField label="Email" required subLabel="(work)" tooltip="Company address" />,
    );
    expect(screen.getByLabelText('required')).toBeOnTheScreen();
    expect(screen.getByText('(work)')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Show hint' }));
    expect(screen.getByText('Company address')).toBeOnTheScreen();
  });

  it('renders left and right adornments', async () => {
    await renderWithProviders(
      <TextField label="Search" left={<Text>L</Text>} right={<Text>R</Text>} />,
    );
    expect(screen.getByText('L')).toBeOnTheScreen();
    expect(screen.getByText('R')).toBeOnTheScreen();
  });

  it('uses a multiline input with the given number of lines', async () => {
    await renderWithProviders(<TextField label="Bio" multiline numberOfLines={6} />);
    expect(screen.getByLabelText('Bio')).toHaveProp('numberOfLines', 6);
  });

  it('keeps the helper hidden and the error announced once errorText is set', async () => {
    const { rerender } = await renderWithProviders(
      <TextField label="Email" helperText="Work only" />,
    );
    expect(screen.getByText('Work only')).toBeOnTheScreen();
    await rerender(<TextField label="Email" helperText="Work only" errorText="Invalid" />);
    expect(screen.queryByText('Work only')).not.toBeOnTheScreen();
    expect(screen.getByRole('alert', { name: 'Invalid' })).toBeOnTheScreen();
  });
});
