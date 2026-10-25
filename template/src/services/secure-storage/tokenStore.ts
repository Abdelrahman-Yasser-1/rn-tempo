import * as Keychain from 'react-native-keychain';
import { z } from 'zod';

import { KEYCHAIN_SERVICES } from '@services/storage/keys';

const TokensSchema = z.object({ accessToken: z.string().min(1), refreshToken: z.string().min(1) });

export type AuthTokens = z.infer<typeof TokensSchema>;

// Keychain is the durable copy; this memory copy lets the axios interceptor read synchronously.
// Tokens never touch MMKV or Zustand.
let cache: AuthTokens | null = null;

/** Loads tokens from the keychain into memory. Call once during bootstrap. */
async function hydrate(): Promise<AuthTokens | null> {
  const credentials = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICES.authTokens });
  cache = null;
  if (credentials) {
    try {
      const parsed = TokensSchema.safeParse(JSON.parse(credentials.password));
      cache = parsed.success ? parsed.data : null;
    } catch {
      cache = null;
    }
  }
  return cache;
}

/** Stores tokens in memory first (so requests see them immediately), then persists them. */
async function setTokens(tokens: AuthTokens): Promise<void> {
  cache = tokens;
  await Keychain.setGenericPassword('auth-tokens', JSON.stringify(tokens), {
    service: KEYCHAIN_SERVICES.authTokens,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

/** Synchronous read of the in-memory access token. */
function getAccessToken(): string | null {
  return cache?.accessToken ?? null;
}

/** Synchronous read of the in-memory refresh token. */
function getRefreshToken(): string | null {
  return cache?.refreshToken ?? null;
}

/** Whether any token pair is currently held. */
function hasTokens(): boolean {
  return cache !== null;
}

/** Forgets tokens in memory and removes them from the keychain. */
async function clear(): Promise<void> {
  cache = null;
  await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICES.authTokens });
}

/** Keychain-backed token store with a synchronous in-memory cache. */
export const tokenStore = { hydrate, setTokens, getAccessToken, getRefreshToken, hasTokens, clear };
