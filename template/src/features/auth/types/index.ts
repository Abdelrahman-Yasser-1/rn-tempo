import { z } from 'zod';

/** Contract C13 `User`. WS9 may extend the schema with its own fields. */
export const UserSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  gender: z.string(),
  image: z.string(),
});

export type User = z.infer<typeof UserSchema>;
