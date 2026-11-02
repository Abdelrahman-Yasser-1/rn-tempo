import { screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';
import type { ComponentProps } from 'react';

import { authKeys, useAuthStore } from '@features/auth';
import { toast } from '@services/toast/toast';
import { createUser } from '@test-utils/factories/user';
import { server } from '@test-utils/msw/server';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { EditProfileScreen } from './EditProfileScreen';

type EditProfileProps = ComponentProps<typeof EditProfileScreen>;

const ORIGINAL = createUser({
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.test',
});

function makeNavigation() {
  return { navigate: jest.fn(), reset: jest.fn(), goBack: jest.fn() };
}

async function renderEditProfile(navigation = makeNavigation()) {
  const props = {
    navigation,
    route: { key: 'EditProfile', name: 'EditProfile' },
  } as unknown as EditProfileProps;
  return renderWithProviders(<EditProfileScreen {...props} />);
}

/** Records every PUT /users/:id body the screen sends. */
function recordUpdates() {
  const bodies: unknown[] = [];
  server.use(
    http.put('*/users/:id', async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ ...ORIGINAL, ...(bodies.at(-1) as object), id: ORIGINAL.id });
    }),
  );
  return bodies;
}

describe('EditProfileScreen', () => {
  let toastSpy: jest.SpyInstance;

  beforeEach(() => {
    // The toast is not under test here; the spy only records calls.
    toastSpy = jest.spyOn(toast, 'show').mockImplementation(() => {
      // Intentionally empty.
    });
    useAuthStore.setState({ status: 'signedIn', user: ORIGINAL });
  });

  afterEach(() => {
    toastSpy.mockRestore();
  });

  test('AC-1: starts with the current name and email in the fields', async () => {
    await renderEditProfile();

    expect(screen.getByLabelText('First name')).toHaveDisplayValue('Ada');
    expect(screen.getByLabelText('Last name')).toHaveDisplayValue('Lovelace');
    expect(screen.getByLabelText('Email')).toHaveDisplayValue('ada@example.test');
  });

  test('AC-2: invalid input shows field errors and sends no request', async () => {
    const bodies = recordUpdates();
    const navigation = makeNavigation();
    const { user } = await renderEditProfile(navigation);

    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'A');
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Enter at least 2 characters.')).toBeOnTheScreen();
    expect(screen.getByText('Enter a valid email address.')).toBeOnTheScreen();
    expect(bodies).toEqual([]);
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  test('AC-3: valid input updates the cache before the server answers, then goes back', async () => {
    // Replaced by the executor below, before any request can use it.
    let release: () => void = () => {
      // Placeholder until the promise executor runs.
    };
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.put('*/users/:id', async ({ request }) => {
        const body = (await request.json()) as object;
        await gate;
        return HttpResponse.json({ ...ORIGINAL, ...body, id: ORIGINAL.id });
      }),
    );
    const navigation = makeNavigation();
    const { user, queryClient } = await renderEditProfile(navigation);
    queryClient.setQueryData(authKeys.me(), ORIGINAL);

    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'Augusta');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(navigation.goBack).toHaveBeenCalledTimes(1);
    });
    expect(queryClient.getQueryData(authKeys.me())).toMatchObject({ firstName: 'Augusta' });
    expect(useAuthStore.getState().user).toMatchObject({ firstName: 'Augusta' });

    release();
    await waitFor(() => {
      expect(queryClient.getQueryData(authKeys.me())).toMatchObject({ firstName: 'Augusta' });
    });
    expect(toastSpy).not.toHaveBeenCalled();
  });

  test('AC-3: the saved body carries the edited values', async () => {
    const bodies = recordUpdates();
    const navigation = makeNavigation();
    const { user } = await renderEditProfile(navigation);

    await user.clear(screen.getByLabelText('Last name'));
    await user.type(screen.getByLabelText('Last name'), 'Byron');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    expect(bodies[0]).toEqual({
      firstName: 'Ada',
      lastName: 'Byron',
      email: 'ada@example.test',
    });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  test('AC-4: a failed save rolls the cache and user back and shows an error toast', async () => {
    server.use(
      http.put('*/users/:id', () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
    );
    const navigation = makeNavigation();
    const { user, queryClient } = await renderEditProfile(navigation);
    queryClient.setQueryData(authKeys.me(), ORIGINAL);

    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'Augusta');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          title: 'Something went wrong on our side. Please try again later.',
        }),
      );
    });
    expect(queryClient.getQueryData(authKeys.me())).toEqual(ORIGINAL);
    expect(useAuthStore.getState().user).toEqual(ORIGINAL);
  });
});
