import { createUser } from '../../factories/user';

import type { MockRoute } from './types';

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

const asRecord = (body: unknown): Record<string, unknown> =>
  typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

export const authRoutes: MockRoute[] = [
  {
    method: 'post',
    path: '/auth/login',
    resolve: ({ body }) => {
      const { username, password } = asRecord(body);
      if (username === MOCK_CREDENTIALS.username && password === MOCK_CREDENTIALS.password) {
        return {
          status: 200,
          body: { ...mockUser, accessToken: MOCK_ACCESS_TOKEN, refreshToken: MOCK_REFRESH_TOKEN },
        };
      }
      return { status: 400, body: { message: 'Invalid credentials' } };
    },
  },
  {
    method: 'post',
    path: '/auth/refresh',
    resolve: ({ body }) =>
      asRecord(body).refreshToken === MOCK_REFRESH_TOKEN
        ? {
            status: 200,
            body: { accessToken: MOCK_ACCESS_TOKEN, refreshToken: MOCK_REFRESH_TOKEN },
          }
        : { status: 401, body: { message: 'Invalid refresh token' } },
  },
  {
    method: 'get',
    path: '/auth/me',
    resolve: ({ headers }) =>
      headers.authorization === `Bearer ${MOCK_ACCESS_TOKEN}`
        ? { status: 200, body: mockUser }
        : { status: 401, body: { message: 'Invalid or expired token' } },
  },
];
