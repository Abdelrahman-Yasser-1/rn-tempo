import type { User } from '@features/auth';

let sequence = 0;

/** Builds a valid `User` (contract C13); pass overrides for the fields a test cares about. */
export function createUser(overrides: Partial<User> = {}): User {
  sequence += 1;
  const label = String(sequence);
  return {
    id: sequence,
    username: `user${label}`,
    email: `user${label}@example.test`,
    firstName: 'Test',
    lastName: `User${label}`,
    gender: 'female',
    image: `https://example.test/avatars/${label}.png`,
    ...overrides,
  };
}
