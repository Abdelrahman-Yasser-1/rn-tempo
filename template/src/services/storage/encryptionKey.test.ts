import { generateEncryptionKey, KEY_RANDOM_BYTES } from './encryptionKey';

describe('generateEncryptionKey', () => {
  test('encodes 24 random bytes into a 32-char base64 key (fits MMKV AES-256, 192 bits)', () => {
    const random = jest.fn((length: number) => new Uint8Array(length).fill(255));

    const key = generateEncryptionKey(random);

    expect(random).toHaveBeenCalledWith(KEY_RANDOM_BYTES);
    expect(KEY_RANDOM_BYTES).toBe(24);
    expect(key).toBe('/'.repeat(32));
    // Every char is ASCII, so the UTF-8 length MMKV sees is also 32 bytes (its AES-256 maximum).
    expect(/^[\u0020-\u007E]+$/.test(key)).toBe(true);
  });

  test('matches the standard base64 encoding of the bytes', () => {
    const bytes = Uint8Array.from('Man'.repeat(8), (char) => char.charCodeAt(0));

    expect(generateEncryptionKey(() => bytes)).toBe('TWFu'.repeat(8));
  });

  test('default source yields a fresh 32-char key each call', () => {
    const first = generateEncryptionKey();
    const second = generateEncryptionKey();

    expect(first).toMatch(/^[a-z\d+/]{32}$/i);
    expect(first).not.toBe(second);
  });
});
