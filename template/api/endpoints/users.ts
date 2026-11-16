import { ApiError, defineEndpoint } from '@rn-tempo/api-contract';
import { z } from 'zod';

import { UserSchema } from '@features/auth/types';

import { MOCK_USER } from './auth';

/** Id dummyjson assigns to a newly added user. */
const NEW_USER_ID = 209;

/** Fields a client may send; the mock echoes whatever arrives on top of the demo user. */
const UserFieldsSchema = z.looseObject({
  username: z.string().optional(),
  email: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export const addUser = defineEndpoint({
  method: 'POST',
  path: '/users/add',
  summary: 'Register a user',
  tags: ['users'],
  status: 201,
  body: UserFieldsSchema,
  response: UserSchema,
  data: ({ body }) => ({
    ...MOCK_USER,
    username: 'newuser',
    email: 'new.user@x.dummyjson.com',
    ...body,
    id: NEW_USER_ID,
  }),
});

export const updateUser = defineEndpoint({
  method: 'PUT',
  path: '/users/:id',
  summary: 'Update a user',
  tags: ['users'],
  params: z.object({ id: z.string() }),
  body: UserFieldsSchema,
  response: UserSchema,
  data: ({ params, body }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id)) {
      throw new ApiError(404, `User with id '${params.id}' not found`);
    }
    return { ...MOCK_USER, ...body, id };
  },
});
