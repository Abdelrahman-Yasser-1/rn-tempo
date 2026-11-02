import { act, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';

import { useAuthStore } from '@features/auth';
import { toast } from '@services/toast/toast';
import { createUser } from '@test-utils/factories/user';
import { fillFields } from '@test-utils/form';
import { server } from '@test-utils/msw/server';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useEditProfileScreen } from './useEditProfileScreen';

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

const ORIGINAL = createUser({
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.test',
});

/** The toast is not under test here; the spy only records calls. */
function silenceToast(): void {
  // Intentionally empty.
}

let toastSpy: jest.SpyInstance;
let bodies: unknown[];

beforeEach(() => {
  toastSpy = jest.spyOn(toast, 'show').mockImplementation(silenceToast);
  useAuthStore.setState({ status: 'signedIn', user: ORIGINAL });
  bodies = [];
  server.use(
    http.put('*/users/:id', async ({ request }) => {
      const body = (await request.json()) as object;
      bodies.push(body);
      return HttpResponse.json({ ...ORIGINAL, ...body, id: ORIGINAL.id });
    }),
  );
});

afterEach(() => {
  toastSpy.mockRestore();
});

async function submit(result: { current: ReturnType<typeof useEditProfileScreen> }) {
  await act(() => {
    result.current.onSubmit();
    return Promise.resolve();
  });
}

describe('useEditProfileScreen', () => {
  test('prefills the form from the current user and is not pending', async () => {
    const { result } = await renderHookWithProviders(() => useEditProfileScreen());

    expect(result.current.isPending).toBe(false);
    await submit(result);

    await waitFor(() => {
      expect(bodies).toEqual([
        { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test' },
      ]);
    });
  });

  test('a valid edit saves and goes back right away', async () => {
    const { result } = await renderHookWithProviders(() => useEditProfileScreen());
    await fillFields(result.current.control, { firstName: 'Augusta' });

    await submit(result);

    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(bodies).toEqual([expect.objectContaining({ firstName: 'Augusta' })]);
    });
  });

  test('invalid input sends nothing and does not go back', async () => {
    const { result } = await renderHookWithProviders(() => useEditProfileScreen());
    await fillFields(result.current.control, { firstName: 'A', email: 'not-an-email' });

    await submit(result);

    expect(bodies).toEqual([]);
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  test('without a user the form starts empty and does not submit', async () => {
    useAuthStore.setState({ status: 'signedOut', user: null });
    const { result } = await renderHookWithProviders(() => useEditProfileScreen());

    await submit(result);

    expect(bodies).toEqual([]);
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  test('onBack is the navigation goBack', async () => {
    const { result } = await renderHookWithProviders(() => useEditProfileScreen());

    result.current.onBack();

    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });
});
