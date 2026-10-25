import * as Keychain from 'react-native-keychain';

import { KEYCHAIN_SERVICES } from './keys';

// MMKV accepts at most 32 key bytes (AES-256). Contract C15 asks for 32 random bytes hex-encoded
// (64 chars), which MMKV would reject, so we use 16 random bytes hex-encoded = 32 chars.
const KEY_RANDOM_BYTES = 16;

type WebCrypto = { getRandomValues?: (array: Uint8Array) => Uint8Array };

function generateKey(): string {
  const { crypto } = globalThis as { crypto?: WebCrypto };
  if (typeof crypto?.getRandomValues !== 'function') {
    throw new Error('crypto.getRandomValues is unavailable; cannot create the storage key');
  }
  const bytes = crypto.getRandomValues(new Uint8Array(KEY_RANDOM_BYTES));
  return Array.from(bytes, (byte: number) => byte.toString(16).padStart(2, '0')).join('');
}

/** Returns the MMKV encryption key from the keychain, creating and storing it on first launch. */
export async function getOrCreateEncryptionKey(): Promise<string> {
  const existing = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICES.mmkvKey });
  if (existing) {
    return existing.password;
  }
  const key = generateKey();
  await Keychain.setGenericPassword('mmkv-encryption-key', key, {
    service: KEYCHAIN_SERVICES.mmkvKey,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}
