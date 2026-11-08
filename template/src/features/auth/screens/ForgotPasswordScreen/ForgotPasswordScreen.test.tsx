import { screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';

import { server } from '@test-utils/msw/server';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ForgotPasswordScreen } from './ForgotPasswordScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<Record<string, unknown>>('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

beforeEach(() => {
  mockNavigation.navigate.mockClear();
  mockNavigation.goBack.mockClear();
  mockNavigation.reset.mockClear();
});

async function renderForgotPassword() {
  const view = await renderWithProviders(<ForgotPasswordScreen />);
  return view;
}
describe('ForgotPasswordScreen', () => {
  test('lays out the header, title and subtitle with the Maestro test IDs', async () => {
    await renderForgotPassword();

    /* eslint-disable rn-tempo/discouraged-syntax -- Maestro flows address these IDs */
    expect(screen.getByTestId('forgot-password-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('forgot-password.header')).toBeOnTheScreen();
    expect(screen.getByTestId('forgot-password.submit-button')).toBeOnTheScreen();
    /* eslint-enable rn-tempo/discouraged-syntax -- end of the block disabled above */
    expect(screen.getByRole('header', { name: 'Reset your password' })).toBeOnTheScreen();
    expect(screen.getByText("Enter your email and we'll send you a code.")).toBeOnTheScreen();
  });

  test('AC-8: a valid email goes to Otp with purpose reset-password', async () => {
    const { user } = await renderForgotPassword();

    await user.type(screen.getByLabelText('Email'), 'emily@example.test');
    await user.press(screen.getByRole('button', { name: 'Send code' }));

    await waitFor(() => {
      expect(mockNavigation.navigate).toHaveBeenCalledWith('Otp', {
        target: 'emily@example.test',
        purpose: 'reset-password',
      });
    });
  });

  test('an invalid email shows the validation message and sends no request', async () => {
    const requests = jest.fn(() => HttpResponse.json({ success: true }));
    server.use(http.post('*/auth/forgot-password', requests));
    const { user } = await renderForgotPassword();

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.press(screen.getByRole('button', { name: 'Send code' }));

    expect(await screen.findByText('Enter a valid email address.')).toBeOnTheScreen();
    expect(requests).not.toHaveBeenCalled();
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
  });

  test('a server error shows the mapped message and stays on the screen', async () => {
    server.use(
      http.post('*/auth/forgot-password', () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );
    const { user } = await renderForgotPassword();

    await user.type(screen.getByLabelText('Email'), 'emily@example.test');
    await user.press(screen.getByRole('button', { name: 'Send code' }));

    expect(
      await screen.findByText('Something went wrong on our side. Please try again later.'),
    ).toBeOnTheScreen();
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
  });

  test('the header back button goes back', async () => {
    const { user } = await renderForgotPassword();

    await user.press(screen.getByRole('button', { name: 'Back' }));

    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });
});
