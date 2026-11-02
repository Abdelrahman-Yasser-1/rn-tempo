import type { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import type { ComponentProps } from 'react';

import { server } from '@test-utils/msw/server';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ForgotPasswordScreen } from './ForgotPasswordScreen';

type ForgotPasswordProps = ComponentProps<typeof ForgotPasswordScreen>;

function makeNavigation() {
  return { navigate: jest.fn(), reset: jest.fn(), goBack: jest.fn() };
}

// Mutations schedule 5-minute gc timers on the per-test client; releasing it lets Jest exit.
/** clear() leaves each mutation's 5-minute gc timer running; destroy() cancels it first. */
function releaseClient(client: QueryClient | undefined) {
  for (const mutation of client?.getMutationCache().getAll() ?? []) {
    mutation.destroy();
  }
  client?.clear();
}

let renderedClient: QueryClient | undefined;

async function renderForgotPassword(navigation = makeNavigation()) {
  const props = {
    navigation,
    route: { key: 'ForgotPassword', name: 'ForgotPassword' },
  } as unknown as ForgotPasswordProps;
  const view = await renderWithProviders(<ForgotPasswordScreen {...props} />);
  renderedClient = view.queryClient;
  return view;
}

afterEach(() => {
  releaseClient(renderedClient);
  renderedClient = undefined;
});

describe('ForgotPasswordScreen', () => {
  test('AC-8: a valid email goes to Otp with purpose reset-password', async () => {
    const navigation = makeNavigation();
    const { user } = await renderForgotPassword(navigation);

    await user.type(screen.getByLabelText('Email'), 'emily@example.test');
    await user.press(screen.getByRole('button', { name: 'Send code' }));

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('Otp', {
        target: 'emily@example.test',
        purpose: 'reset-password',
      });
    });
  });

  test('an invalid email shows the validation message and sends no request', async () => {
    const requests = jest.fn(() => HttpResponse.json({ success: true }));
    server.use(http.post('*/auth/forgot-password', requests));
    const navigation = makeNavigation();
    const { user } = await renderForgotPassword(navigation);

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.press(screen.getByRole('button', { name: 'Send code' }));

    expect(await screen.findByText('Enter a valid email address.')).toBeOnTheScreen();
    expect(requests).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  test('a server error shows the mapped message and stays on the screen', async () => {
    server.use(
      http.post('*/auth/forgot-password', () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );
    const navigation = makeNavigation();
    const { user } = await renderForgotPassword(navigation);

    await user.type(screen.getByLabelText('Email'), 'emily@example.test');
    await user.press(screen.getByRole('button', { name: 'Send code' }));

    expect(
      await screen.findByText('Something went wrong on our side. Please try again later.'),
    ).toBeOnTheScreen();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  test('the header back button goes back', async () => {
    const navigation = makeNavigation();
    const { user } = await renderForgotPassword(navigation);

    await user.press(screen.getByRole('button', { name: 'Back' }));

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});
