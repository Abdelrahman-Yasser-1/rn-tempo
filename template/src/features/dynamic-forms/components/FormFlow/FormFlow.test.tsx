import { screen, waitFor } from '@testing-library/react-native';

import { getFlow } from '@features/dynamic-forms/utils/flows';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { FormFlow } from './FormFlow';

function flowOf(id: string) {
  const flow = getFlow(id);
  if (!flow) {
    throw new Error(`missing flow ${id}`);
  }
  return flow;
}

describe('FormFlow', () => {
  it('AC-8: runs the JSON demo flow to a typed submit, through the review step', async () => {
    const onSubmit = jest.fn<undefined, [Record<string, unknown>]>();
    const { user } = await renderWithProviders(
      <FormFlow flow={flowOf('demo-json')} onSubmit={onSubmit} />,
    );

    await user.type(screen.getByLabelText('Full name'), 'Sam');
    // "Email" is also an option of the radio group below the text field.
    const [emailField] = screen.getAllByLabelText('Email');
    if (!emailField) {
      throw new Error('the Email field is missing');
    }
    await user.type(emailField, 'sam@example.test');
    expect(screen.queryByLabelText('Phone number (digits only)')).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Step 2 of 4')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('This field is required.')).toBeOnTheScreen();
    await user.type(screen.getByLabelText('Name'), 'Alex');
    await user.press(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Step 3 of 4')).toBeOnTheScreen();
    await user.press(screen.getByRole('checkbox', { name: 'I agree to be contacted' }));
    await user.press(screen.getByRole('button', { name: 'Next' }));

    expect(await screen.findByText('Step 4 of 4')).toBeOnTheScreen();
    expect(screen.getByText('Sam')).toBeOnTheScreen();
    expect(screen.getByText('Name: Alex')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      fullName: 'Sam',
      email: 'sam@example.test',
      contactBy: 'email',
      members: [{ name: 'Alex' }],
      notes: '',
      agree: true,
    });
  });

  it('AC-3: the code demo flow shows the mocked async error for a taken username', async () => {
    const { user } = await renderWithProviders(
      <FormFlow flow={flowOf('demo-code')} onSubmit={jest.fn()} />,
    );
    await user.type(screen.getByLabelText('Username (try "taken")'), 'taken');
    expect(
      await screen.findByText('This username is taken.', {}, { timeout: 3000 }),
    ).toBeOnTheScreen();
  });

  it('AC-4: Back is disabled on the first step', async () => {
    await renderWithProviders(<FormFlow flow={flowOf('demo-code')} onSubmit={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });
});
