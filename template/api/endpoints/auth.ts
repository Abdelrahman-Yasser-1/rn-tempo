import { ApiError, defineEndpoint } from '@rn-tempo/api-contract';
import { z } from 'zod';

import { LoginResponseSchema } from '@features/auth/api/schemas';
import { UserSchema } from '@features/auth/types';

/** dummyjson's real demo account (contract C13). Public test data, never a real credential. */
export const MOCK_CREDENTIALS = { username: 'emilys', password: 'emilyspass' } as const;

export const MOCK_ACCESS_TOKEN = 'mock-access-token';
export const MOCK_REFRESH_TOKEN = 'mock-refresh-token';

/** The signed-in user the mock API returns. */
export const MOCK_USER = {
  id: 1,
  username: MOCK_CREDENTIALS.username,
  email: 'emily.johnson@x.dummyjson.com',
  firstName: 'Emily',
  lastName: 'Johnson',
  gender: 'female',
  image: 'https://dummyjson.com/icon/emilys/128',
} satisfies z.input<typeof UserSchema>;

const TokensSchema = z.object({ accessToken: z.string(), refreshToken: z.string() });

export const login = defineEndpoint({
  method: 'POST',
  path: '/auth/login',
  summary: 'Sign in',
  tags: ['auth'],
  body: z.object({
    username: z.string(),
    password: z.string(),
    expiresInMins: z.number().int().positive().optional(),
  }),
  response: LoginResponseSchema,
  data: ({ body }) => {
    if (
      body.username !== MOCK_CREDENTIALS.username ||
      body.password !== MOCK_CREDENTIALS.password
    ) {
      throw new ApiError(400, 'Invalid credentials');
    }
    return { ...MOCK_USER, accessToken: MOCK_ACCESS_TOKEN, refreshToken: MOCK_REFRESH_TOKEN };
  },
});

export const refresh = defineEndpoint({
  method: 'POST',
  path: '/auth/refresh',
  summary: 'Trade a refresh token for new tokens',
  tags: ['auth'],
  body: z.object({ refreshToken: z.string() }).loose(),
  response: TokensSchema,
  data: ({ body }) => {
    if (body.refreshToken !== MOCK_REFRESH_TOKEN) {
      throw new ApiError(401, 'Invalid refresh token');
    }
    return { accessToken: MOCK_ACCESS_TOKEN, refreshToken: MOCK_REFRESH_TOKEN };
  },
});

export const me = defineEndpoint({
  method: 'GET',
  path: '/auth/me',
  summary: 'The signed-in user',
  tags: ['auth'],
  response: UserSchema,
  data: ({ headers }) => {
    // The mock accepts one fixed token, so the check lives here and not in `auth: 'bearer'`, which
    // only knows tokens that the dev API issued itself.
    if (headers.authorization !== `Bearer ${MOCK_ACCESS_TOKEN}`) {
      throw new ApiError(401, 'Invalid or expired token');
    }
    return MOCK_USER;
  },
});
