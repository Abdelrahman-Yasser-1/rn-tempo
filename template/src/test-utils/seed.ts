import type { z } from 'zod';

import type { UserSchema } from '@features/auth/types';

/**
 * What the committed Tempo backend (`backend/backend.json`) is seeded with, for tests that assert on it.
 * Keep these equal to the seed: a test run answers the app's requests from that backend in test mode.
 */

/** The seeded demo account. Public test data, never a real credential. */
export const MOCK_CREDENTIALS = { username: 'emilys', password: 'emilyspass' } as const;

/** The tokens the test kit hands out (`testTokens` in `jest.backend.setup.js`). */
export const MOCK_ACCESS_TOKEN = 'mock-access-token';
export const MOCK_REFRESH_TOKEN = 'mock-refresh-token';

/** The seeded user. */
export const mockUser = {
  id: 1,
  username: MOCK_CREDENTIALS.username,
  email: 'emily.johnson@x.dummyjson.com',
  firstName: 'Emily',
  lastName: 'Johnson',
  gender: 'female',
  image: 'https://dummyjson.com/icon/emilys/128',
} satisfies z.input<typeof UserSchema>;

/** A remote config that blocks nothing, to build overrides from. */
export const mockAppConfig = {
  minSupportedVersion: { ios: '0.0.0', android: '0.0.0' },
  latestVersion: { ios: '1.0.0', android: '1.0.0' },
  maintenance: { enabled: false },
  flags: {},
  storeUrls: {
    ios: 'https://apps.apple.com/app/id0000000000',
    android: 'https://play.google.com/store/apps/details?id=com.rntempo.app',
  },
};
