import { ApiError, defineEndpoint, type EndpointDefinition } from '@rn-tempo/api-contract';
import { z } from 'zod';

import type { Store } from './store.ts';

/**
 * Mock auth for local development ONLY.
 *
 * - The credentials are public (they are dummyjson's demo account).
 * - Tokens are random opaque strings kept in the dev store, not signed JWTs; they prove nothing.
 * - Every response carries `x-tempo-dev-api`, so a client or proxy that sees it knows it is a mock.
 */
export const MOCK_USER = {
  id: 1,
  username: 'emilys',
  email: 'emily.johnson@x.dummyjson.com',
  firstName: 'Emily',
  lastName: 'Johnson',
  gender: 'female',
  image: 'https://dummyjson.com/icon/emilys/128',
} as const;
const MOCK_PASSWORD = 'emilyspass';

const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const User = z.object({
  id: z.number().int(),
  username: z.string(),
  email: z.email(),
  firstName: z.string(),
  lastName: z.string(),
  gender: z.string(),
  image: z.string(),
});
const Tokens = z.object({ accessToken: z.string(), refreshToken: z.string() });

/** Reads `Authorization: Bearer <token>`; returns the token or undefined. */
export function bearerToken(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  const match = /^Bearer\s+(\S+)$/i.exec(value ?? '');
  return match?.[1];
}

/** The C13 auth endpoints: login, refresh and me, backed by the store's tokens. */
export function mockAuthEndpoints(store: Store): EndpointDefinition[] {
  const login = defineEndpoint({
    id: 'post.auth.login',
    method: 'POST',
    path: '/auth/login',
    summary: 'Mock login (development only)',
    tags: ['auth'],
    body: z.object({
      username: z.string().min(1),
      password: z.string().min(1),
      expiresInMins: z.number().int().positive().optional(),
    }),
    response: User.extend(Tokens.shape),
    data: ({ body }) => {
      if (body.username !== MOCK_USER.username || body.password !== MOCK_PASSWORD) {
        throw new ApiError(400, 'Invalid credentials');
      }
      const accessTtl = body.expiresInMins === undefined ? ACCESS_TTL_MS : body.expiresInMins * 60_000;
      return {
        ...MOCK_USER,
        accessToken: store.issueToken(body.username, 'access', accessTtl),
        refreshToken: store.issueToken(body.username, 'refresh', REFRESH_TTL_MS),
      };
    },
  });

  const refresh = defineEndpoint({
    id: 'post.auth.refresh',
    method: 'POST',
    path: '/auth/refresh',
    summary: 'Mock token refresh (development only)',
    tags: ['auth'],
    body: z.object({ refreshToken: z.string().min(1), expiresInMins: z.number().int().positive().optional() }),
    response: Tokens,
    data: ({ body }) => {
      const record = store.findToken(body.refreshToken, 'refresh');
      if (record === undefined) throw new ApiError(401, 'Invalid refresh token');
      // Rotation: a refresh token works once.
      store.revokeToken(body.refreshToken);
      const accessTtl = body.expiresInMins === undefined ? ACCESS_TTL_MS : body.expiresInMins * 60_000;
      return {
        accessToken: store.issueToken(record.username, 'access', accessTtl),
        refreshToken: store.issueToken(record.username, 'refresh', REFRESH_TTL_MS),
      };
    },
  });

  const me = defineEndpoint({
    id: 'get.auth.me',
    method: 'GET',
    path: '/auth/me',
    summary: 'The signed-in user (development only)',
    tags: ['auth'],
    auth: 'bearer',
    response: User,
    data: () => ({ ...MOCK_USER }),
  });

  return [login, refresh, me];
}
