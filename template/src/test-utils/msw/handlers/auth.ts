import { http, HttpResponse } from 'msw';

import { createUser } from '../../factories/user';

/** dummyjson's real demo account (contract C13). */
export const MOCK_CREDENTIALS = { username: 'emilys', password: 'emilyspass' } as const;

export const MOCK_ACCESS_TOKEN = 'mock-access-token';
export const MOCK_REFRESH_TOKEN = 'mock-refresh-token';

/** The signed-in user the mock API returns. */
export const mockUser = createUser({
  id: 1,
  username: MOCK_CREDENTIALS.username,
  email: 'emily.johnson@x.dummyjson.com',
  firstName: 'Emily',
  lastName: 'Johnson',
  gender: 'female',
  image: 'https://dummyjson.com/icon/emilys/128',
});

const isBearer = (request: Request, token: string): boolean =>
  request.headers.get('authorization') === `Bearer ${token}`;

// Wildcard hosts so the debug-menu API URL override keeps hitting the mocks.
export const authHandlers = [
  http.post('*/auth/login', async ({ request }) => {
    const body = (await request.json()) as { username?: string; password?: string };
    if (
      body.username === MOCK_CREDENTIALS.username &&
      body.password === MOCK_CREDENTIALS.password
    ) {
      return HttpResponse.json({
        ...mockUser,
        accessToken: MOCK_ACCESS_TOKEN,
        refreshToken: MOCK_REFRESH_TOKEN,
      });
    }
    return HttpResponse.json({ message: 'Invalid credentials' }, { status: 400 });
  }),

  http.post('*/auth/refresh', async ({ request }) => {
    const body = (await request.json()) as { refreshToken?: string };
    if (body.refreshToken === MOCK_REFRESH_TOKEN) {
      return HttpResponse.json({
        accessToken: MOCK_ACCESS_TOKEN,
        refreshToken: MOCK_REFRESH_TOKEN,
      });
    }
    return HttpResponse.json({ message: 'Invalid refresh token' }, { status: 401 });
  }),

  http.get('*/auth/me', ({ request }) =>
    isBearer(request, MOCK_ACCESS_TOKEN)
      ? HttpResponse.json(mockUser)
      : HttpResponse.json({ message: 'Invalid or expired token' }, { status: 401 }),
  ),
];
