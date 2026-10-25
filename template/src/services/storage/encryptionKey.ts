import * as Keychain from 'react-native-keychain';

import { KEYCHAIN_SERVICES } from './keys';

// MMKV takes the key as a string and uses its UTF-8 bytes as raw key material: at most 32 bytes
// with AES-256. Only 7-bit characters stay one byte each in UTF-8, so a string cannot carry a
// full 256 bits. Base64 (6 bits per char) over 24 random bytes fills all 32 characters with
// 192 bits of entropy, the strongest key we can express while keeping the AES-256 cipher.
// Contract C15's "32 bytes hex" would be 64 characters, which MMKV rejects.
export const KEY_RANDOM_BYTES = 24;

// eslint-disable-next-line no-secrets/no-secrets -- public base64 alphabet, not a secret
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

type RandomSource = (length: number) => Uint8Array;

type WebCrypto = { getRandomValues?: (array: Uint8Array) => Uint8Array };

const secureRandomBytes: RandomSource = (length) => {
  const { crypto } = globalThis as { crypto?: WebCrypto };
  if (typeof crypto?.getRandomValues !== 'function') {
    throw new Error('crypto.getRandomValues is unavailable; cannot create the storage key');
  }
  return crypto.getRandomValues(new Uint8Array(length));
};

/** Base64 without padding; input length must be a multiple of 3 so the output is exact. */
function toBase64(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const chunk =
      ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    for (const shift of [18, 12, 6, 0]) {
      output += BASE64_ALPHABET.charAt((chunk >> shift) & 63);
    }
  }
  return output;
}

/** Builds a 32-character MMKV key from 24 random bytes (192 bits of entropy). */
export function generateEncryptionKey(random: RandomSource = secureRandomBytes): string {
  return toBase64(random(KEY_RANDOM_BYTES));
}

/** Returns the MMKV encryption key from the keychain, creating and storing it on first launch. */
export async function getOrCreateEncryptionKey(): Promise<string> {
  const existing = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICES.mmkvKey });
  if (existing) {
    return existing.password;
  }
  const key = generateEncryptionKey();
  await Keychain.setGenericPassword('mmkv-encryption-key', key, {
    service: KEYCHAIN_SERVICES.mmkvKey,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}
