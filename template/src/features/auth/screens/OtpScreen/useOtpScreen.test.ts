import { act, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';

import { OTP_RESEND_SECONDS } from '@features/auth/constants';
import { toast } from '@services/toast/toast';
import { actAsync } from '@test-utils/act';
import { server } from '@test-utils/msw/server';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useOtpScreen } from './useOtpScreen';

type OtpRoute = Parameters<typeof useOtpScreen>[0];

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<Record<string, unknown>>('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const TARGET = 'emily@example.test';
const LOGIN_RESET = { index: 0, routes: [{ name: 'Login' }] };

const routeFor = (params: unknown) => ({ key: 'Otp', name: 'Otp', params }) as unknown as OtpRoute;
const validRoute = (purpose: 'register' | 'reset-password' = 'reset-password') =>
  routeFor({ target: TARGET, purpose });

/** The toast is not under test here; the spy only records calls. */
function silenceToast(): void {
  // Intentionally empty.
}

let toastSpy: jest.SpyInstance;

beforeEach(() => {
  mockNavigation.reset.mockClear();
  mockNavigation.goBack.mockClear();
  // The real toast schedules visibility timers that would outlive the test.
  toastSpy = jest.spyOn(toast, 'show').mockImplementation(silenceToast);
});

afterEach(() => {
  toastSpy.mockRestore();
});

describe('useOtpScreen', () => {
  test('valid params expose the masked target and the full cooldown', async () => {
    const { result } = await renderHookWithProviders(() => useOtpScreen(validRoute()));

    expect(result.current.isValid).toBe(true);
    expect(result.current.maskedTarget).toBe('e****@example.test');
    expect(result.current.code).toBe('');
    expect(result.current.cooldownRemaining).toBe(OTP_RESEND_SECONDS);
    expect(result.current.isCooldownRunning).toBe(true);
    expect(mockNavigation.reset).not.toHaveBeenCalled();
  });

  test('forged params are invalid and reset the stack to Login', async () => {
    const { result } = await renderHookWithProviders(() =>
      useOtpScreen(routeFor({ target: 'nope', purpose: 'admin' })),
    );

    expect(result.current.isValid).toBe(false);
    expect(mockNavigation.reset).toHaveBeenCalledWith(LOGIN_RESET);
  });

  test('onChangeCode updates the code', async () => {
    const { result } = await renderHookWithProviders(() => useOtpScreen(validRoute()));

    await actAsync(() => {
      result.current.onChangeCode('123');
    });

    expect(result.current.code).toBe('123');
  });

  test.each([
    ['reset-password', 'Code verified. Sign in to continue.'],
    ['register', 'Account created. Sign in to continue.'],
  ] as const)('a correct %s code shows a toast and resets to Login', async (purpose, title) => {
    const { result } = await renderHookWithProviders(() => useOtpScreen(validRoute(purpose)));

    await act(() => {
      result.current.onComplete('123456');
      return Promise.resolve();
    });

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', title }));
    });
    expect(mockNavigation.reset).toHaveBeenCalledWith(LOGIN_RESET);
  });

  test('a wrong code sets the invalid-code message and clears the code', async () => {
    const { result } = await renderHookWithProviders(() => useOtpScreen(validRoute()));
    await actAsync(() => {
      result.current.onChangeCode('000000');
    });

    await act(() => {
      result.current.onComplete('000000');
      return Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.errorMessage).toBe('That code is incorrect. Try again.');
    });
    expect(result.current.code).toBe('');
    expect(toastSpy).not.toHaveBeenCalled();
    expect(mockNavigation.reset).not.toHaveBeenCalled();
  });

  test('a request failure maps to the generic message and clears the code', async () => {
    server.use(
      http.post('*/auth/otp/verify', () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
    );
    const { result } = await renderHookWithProviders(() => useOtpScreen(validRoute()));
    await actAsync(() => {
      result.current.onChangeCode('123456');
    });

    await act(() => {
      result.current.onComplete('123456');
      return Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.errorMessage).toBe(
        'Something went wrong on our side. Please try again later.',
      );
    });
    expect(result.current.code).toBe('');
  });

  test('resend restarts the cooldown with the server value and clears a rejected code', async () => {
    server.use(
      http.post('*/auth/otp/resend', () => HttpResponse.json({ success: true, retryAfterSec: 5 })),
    );
    const { result } = await renderHookWithProviders(() => useOtpScreen(validRoute()));

    await act(() => {
      result.current.onResend();
      return Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.cooldownRemaining).toBe(5);
    });
    expect(result.current.isCooldownRunning).toBe(true);
    expect(result.current.errorMessage).toBeUndefined();
  });

  test('a resend failure maps to the generic message', async () => {
    server.use(
      http.post('*/auth/otp/resend', () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
    );
    const { result } = await renderHookWithProviders(() => useOtpScreen(validRoute()));

    await act(() => {
      result.current.onResend();
      return Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.errorMessage).toBe(
        'Something went wrong on our side. Please try again later.',
      );
    });
  });

  test('onBack is the navigation goBack', async () => {
    const { result } = await renderHookWithProviders(() => useOtpScreen(validRoute()));

    result.current.onBack();

    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });
});
