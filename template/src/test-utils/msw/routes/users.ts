import { mockUser } from './auth';
import type { MockRoute } from './types';

/** Id dummyjson assigns to a newly added user. */
const NEW_USER_ID = 209;

const asRecord = (body: unknown): Record<string, unknown> =>
  typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

export const userRoutes: MockRoute[] = [
  {
    method: 'post',
    path: '/users/add',
    resolve: ({ body }) => ({
      status: 201,
      body: {
        ...mockUser,
        username: 'newuser',
        email: 'new.user@x.dummyjson.com',
        ...asRecord(body),
        id: NEW_USER_ID,
      },
    }),
  },
  {
    method: 'put',
    path: '/users/:id',
    resolve: ({ params, body }) => {
      const id = Number(params.id);
      return Number.isInteger(id)
        ? { status: 200, body: { ...mockUser, ...asRecord(body), id } }
        : { status: 404, body: { message: `User with id '${params.id ?? ''}' not found` } };
    },
  },
];
