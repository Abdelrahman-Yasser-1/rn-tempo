import { screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';

import { server } from '@test-utils/msw/server';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { RegisterScreen } from './RegisterScreen';

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

const VALID_FORM = {
  firstName: 'Emily',
  lastName: 'Johnson',
  username: 'emilys',
  email: 'emily@example.test',
  password: 'secret123',
};

async function renderRegister() {
  const view = await renderWithProviders(<RegisterScreen />);
  return view;
}

async function fillForm(
  user: Awaited<ReturnType<typeof renderRegister>>['user'],
  overrides: Partial<typeof VALID_FORM & { confirmPassword: string }> = {},
) {
  const values = { ...VALID_FORM, confirmPassword: VALID_FORM.password, ...overrides };
  await user.type(screen.getByLabelText('First name'), values.firstName);
  await user.type(screen.getByLabelText('Last name'), values.lastName);
  await user.type(screen.getByLabelText('Username'), values.username);
  await user.type(screen.getByLabelText('Email'), values.email);
  await user.type(screen.getByLabelText('Password'), values.password);
  await user.type(screen.getByLabelText('Confirm password'), values.confirmPassword);
}
describe('RegisterScreen', () => {
  test('AC-7: a valid form goes to Otp with purpose register', async () => {
    const { user } = await renderRegister();

    await fillForm(user);
    await user.press(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(mockNavigation.navigate).toHaveBeenCalledWith('Otp', {
        target: VALID_FORM.email,
        purpose: 'register',
      });
    });
  });

  test('mismatched passwords show the mismatch error and send no request', async () => {
    const requests = jest.fn(() => HttpResponse.json({ id: 1 }, { status: 201 }));
    server.use(http.post('*/users/add', requests));
    const { user } = await renderRegister();

    await fillForm(user, { confirmPassword: `${VALID_FORM.password}-typo` });
    await user.press(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Passwords do not match.')).toBeOnTheScreen();
    expect(requests).not.toHaveBeenCalled();
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
  });

  test('a server error keeps the user on the form and shows the mapped message', async () => {
    server.use(
      http.post('*/users/add', () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
    );
    const { user } = await renderRegister();

    await fillForm(user);
    await user.press(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText('Something went wrong on our side. Please try again later.'),
    ).toBeOnTheScreen();
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
  });

  test('the header back button goes back', async () => {
    const { user } = await renderRegister();

    await user.press(screen.getByRole('button', { name: 'Back' }));

    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });
});
