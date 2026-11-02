import { act, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';

import { fillFields } from '@test-utils/form';
import { server } from '@test-utils/msw/server';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useForgotPasswordScreen } from './useForgotPasswordScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<Record<string, unknown>>('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

beforeEach(() => {
  mockNavigation.navigate.mockClear();
  mockNavigation.goBack.mockClear();
});

async function submitWith(email: string) {
  const view = await renderHookWithProviders(() => useForgotPasswordScreen());
  await fillFields(view.result.current.control, { email });
  await act(() => {
    view.result.current.onSubmit();
    return Promise.resolve();
  });
  return view;
}

describe('useForgotPasswordScreen', () => {
  test('starts without an error and not pending', async () => {
    const { result } = await renderHookWithProviders(() => useForgotPasswordScreen());

    expect(result.current.errorMessage).toBeUndefined();
    expect(result.current.isPending).toBe(false);
  });

  test('a valid email navigates to Otp for the reset-password purpose', async () => {
    await submitWith('emily@example.test');

    await waitFor(() => {
      expect(mockNavigation.navigate).toHaveBeenCalledWith('Otp', {
        target: 'emily@example.test',
        purpose: 'reset-password',
      });
    });
  });

  test('an invalid email sends no request and does not navigate', async () => {
    const { result } = await submitWith('not-an-email');

    expect(result.current.errorMessage).toBeUndefined();
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
  });

  test('a server error maps to the generic message and does not navigate', async () => {
    server.use(
      http.post('*/auth/forgot-password', () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );
    const { result } = await submitWith('emily@example.test');

    await waitFor(() => {
      expect(result.current.errorMessage).toBe(
        'Something went wrong on our side. Please try again later.',
      );
    });
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
  });

  test('onBack is the navigation goBack', async () => {
    const { result } = await renderHookWithProviders(() => useForgotPasswordScreen());

    result.current.onBack();

    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });
});
