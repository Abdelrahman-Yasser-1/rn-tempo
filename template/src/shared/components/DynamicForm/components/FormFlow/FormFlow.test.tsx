import { screen, waitFor } from '@testing-library/react-native';

import { fromJson } from '@shared/components/DynamicForm/utils/fromJson';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { FormFlow } from './FormFlow';

const label = (en: string) => ({ en, ar: en });

function built(document: unknown) {
  const result = fromJson(document);
  if (!result.success) {
    throw new Error(result.issues.join(', '));
  }
  return result.form;
}

const flow = built({
  version: 1,
  id: 'test-flow',
  review: true,
  steps: [
    {
      id: 'about',
      title: label('About you'),
      fields: [
        {
          type: 'text',
          name: 'fullName',
          label: label('Full name'),
          rules: [{ rule: 'required' }],
        },
      ],
    },
    {
      id: 'consent',
      title: label('Consent'),
      fields: [{ type: 'checkbox', name: 'agree', label: label('I agree') }],
    },
  ],
});

const singlePage = built({
  version: 1,
  id: 'test-form',
  fields: [
    {
      type: 'text',
      name: 'email',
      label: label('Email'),
      rules: [{ rule: 'required' }],
    },
  ],
});

describe('FormFlow', () => {
  it('shows the step header and a disabled Back on the first step', async () => {
    await renderWithProviders(<FormFlow flow={flow} onSubmit={jest.fn()} />);

    expect(screen.getByText('Step 1 of 3')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'About you' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });

  it('validates a step, walks through the review and submits the typed values', async () => {
    const onSubmit = jest.fn<undefined, [Record<string, unknown>]>();
    const { user } = await renderWithProviders(<FormFlow flow={flow} onSubmit={onSubmit} />);

    await user.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('This field is required.')).toBeOnTheScreen();

    await user.type(screen.getByLabelText('Full name'), 'Sam');
    await user.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Step 2 of 3')).toBeOnTheScreen();

    await user.press(screen.getByRole('checkbox', { name: 'I agree' }));
    await user.press(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Step 3 of 3')).toBeOnTheScreen();
    expect(screen.getByText('Sam')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ fullName: 'Sam', agree: true });
  });

  it('renders a single-page document with one Submit button', async () => {
    const onSubmit = jest.fn<undefined, [Record<string, unknown>]>();
    const { user } = await renderWithProviders(<FormFlow flow={singlePage} onSubmit={onSubmit} />);

    expect(screen.queryByText(/^Step /)).not.toBeOnTheScreen();
    await user.type(screen.getByLabelText('Email'), 'sam@example.test');
    await user.press(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ email: 'sam@example.test' });
  });
});
