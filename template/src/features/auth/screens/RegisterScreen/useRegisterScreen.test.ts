import { act, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';

import { fillFields } from '@test-utils/form';
import { server } from '@test-utils/msw/server';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useRegisterScreen } from './useRegisterScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<Record<string, unknown>>('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

beforeEach(() => {
  mockNavigation.navigate.mockClear();
  mockNavigation.goBack.mockClear();
});

const VALID = {
  firstName: 'Emily',
  lastName: 'Johnson',
  username: 'emilyj',
  email: 'emily@example.test',
  password: 'Passw0rd123',
  confirmPassword: 'Passw0rd123',
};

async function submitWith(values: typeof VALID) {
  const view = await renderHookWithProviders(() => useRegisterScreen());
  await fillFields(view.result.current.control, values);
  await act(() => {
    view.result.current.onSubmit();
    return Promise.resolve();
  });
  return view;
}

describe('useRegisterScreen', () => {
  test('starts without an error and not pending', async () => {
    const { result } = await renderHookWithProviders(() => useRegisterScreen());

    expect(result.current.errorMessage).toBeUndefined();
    expect(result.current.isPending).toBe(false);
  });

  test('a valid form navigates to Otp for the register purpose', async () => {
    await submitWith(VALID);

    await waitFor(() => {
      expect(mockNavigation.navigate).toHaveBeenCalledWith('Otp', {
        target: VALID.email,
        purpose: 'register',
      });
    });
  });

  test('mismatched passwords send no request and do not navigate', async () => {
    const { result } = await submitWith({ ...VALID, confirmPassword: 'different1' });

    expect(result.current.errorMessage).toBeUndefined();
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
  });

  test('a server error maps to the generic message and does not navigate', async () => {
    server.use(
      http.post('*/users/add', () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
    );
    const { result } = await submitWith(VALID);

    await waitFor(() => {
      expect(result.current.errorMessage).toBe(
        'Something went wrong on our side. Please try again later.',
      );
    });
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
  });

  test('onBack is the navigation goBack', async () => {
    const { result } = await renderHookWithProviders(() => useRegisterScreen());

    result.current.onBack();

    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });
});
