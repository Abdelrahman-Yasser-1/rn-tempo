import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import type { ComponentProps } from 'react';

import { toast } from '@services/toast/toast';
import { actAsync } from '@test-utils/act';
import { server } from '@test-utils/msw/server';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { OtpScreen } from './OtpScreen';

type OtpProps = ComponentProps<typeof OtpScreen>;

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

const TARGET = 'emily@example.test';

async function renderOtp(purpose: 'register' | 'reset-password' = 'reset-password') {
  const props = {
    route: { key: 'Otp', name: 'Otp', params: { target: TARGET, purpose } },
  } as unknown as OtpProps;
  const view = await renderWithProviders(<OtpScreen {...props} />);
  return view;
}

const firstDigit = () => screen.getByLabelText('Digit 1 of 6');

/** Ticks the countdown one second at a time, letting React commit between ticks. */
async function tickSeconds(seconds: number) {
  for (let index = 0; index < seconds; index += 1) {
    await actAsync(() => {
      jest.advanceTimersByTime(1000);
    });
  }
}

/** The toast is not under test here; the spy only records calls. */
function silenceToast(): void {
  // Intentionally empty.
}

describe('OtpScreen', () => {
  let toastSpy: jest.SpyInstance;

  beforeEach(() => {
    // Replace the real toast: its visibility timers would outlive the test.
    toastSpy = jest.spyOn(toast, 'show').mockImplementation(silenceToast);
  });

  afterEach(() => {
    toastSpy.mockRestore();
  });

  describe('countdown', () => {
    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('AC-4: Resend is disabled until the countdown reaches 0', async () => {
      await renderOtp();

      const resend = screen.getByRole('button', { name: 'Resend in 60s' });
      expect(resend).toBeDisabled();

      await tickSeconds(1);
      expect(screen.getByRole('button', { name: 'Resend in 59s' })).toBeDisabled();

      await tickSeconds(58);
      expect(screen.getByRole('button', { name: 'Resend in 1s' })).toBeDisabled();

      await tickSeconds(1);
      expect(screen.getByRole('button', { name: 'Resend code' })).toBeEnabled();
    });

    test('resending restarts the countdown with the time the server returns', async () => {
      server.use(
        http.post('*/auth/otp/resend', () =>
          HttpResponse.json({ success: true, retryAfterSec: 5 }),
        ),
      );
      await renderOtp();

      await tickSeconds(60);
      expect(screen.getByRole('button', { name: 'Resend code' })).toBeEnabled();
      // The request round trip runs on real timers; the countdown itself is already verified above.
      jest.useRealTimers();

      await fireEvent.press(screen.getByRole('button', { name: 'Resend code' }));

      expect(await screen.findByRole('button', { name: 'Resend in 5s' })).toBeDisabled();
    });
  });

  test('lays out the header, title and masked subtitle with the Maestro test IDs', async () => {
    await renderOtp();

    /* eslint-disable rn-tempo/discouraged-syntax -- Maestro flows address these IDs */
    expect(screen.getByTestId('otp-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('otp.header')).toBeOnTheScreen();
    expect(screen.getByTestId('otp.input')).toBeOnTheScreen();
    expect(screen.getByTestId('otp.resend-button')).toBeOnTheScreen();
    /* eslint-enable rn-tempo/discouraged-syntax -- end of the block disabled above */
    expect(screen.getByRole('header', { name: 'Enter the code' })).toBeOnTheScreen();
    expect(screen.getByText(/We sent a 6-digit code to/)).toBeOnTheScreen();
  });

  test('AC-9: entering 123456 shows a success toast and resets the stack to Login', async () => {
    await renderOtp('reset-password');

    await fireEvent.changeText(firstDigit(), '123456');

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          title: 'Code verified. Sign in to continue.',
        }),
      );
    });
    expect(mockNavigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Login' }] });
  });

  test('a register code shows the account-created toast', async () => {
    await renderOtp('register');

    await fireEvent.changeText(firstDigit(), '123456');

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Account created. Sign in to continue.' }),
      );
    });
  });

  test('a wrong code shows the invalid-code error and clears the input', async () => {
    await renderOtp('reset-password');

    await fireEvent.changeText(firstDigit(), '000000');

    expect(await screen.findByText('That code is incorrect. Try again.')).toBeOnTheScreen();
    expect(firstDigit()).toHaveDisplayValue('');
    expect(toastSpy).not.toHaveBeenCalled();
    expect(mockNavigation.reset).not.toHaveBeenCalled();
  });

  test('forged route params reset the stack to Login and render nothing', async () => {
    const props = {
      route: { key: 'Otp', name: 'Otp', params: { target: 'nope', purpose: 'admin' } },
    } as unknown as OtpProps;

    await renderWithProviders(<OtpScreen {...props} />);

    await waitFor(() => {
      expect(mockNavigation.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Login' }] });
    });
    expect(screen.queryByText('Enter the code')).not.toBeOnTheScreen();
  });
});
