import { z } from 'zod';

// Imported by the config through the `@features/*` alias, like an app's own schemas would be.
export const Product = z.object({
  id: z.number().int(),
  title: z.string(),
  price: z.number().min(1).max(100),
});

export const Profile = z.object({
  firstName: z.string(),
  email: z.email(),
});
