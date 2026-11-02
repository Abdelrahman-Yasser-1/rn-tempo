import { z } from 'zod';

import { emailSchema, nameSchema } from '@shared/utils';

export const UpdateProfileSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
});

export type UpdateProfile = z.infer<typeof UpdateProfileSchema>;
