type WebCrypto = { getRandomValues?: (array: Uint8Array) => Uint8Array };

let fallbackCounter = 0;

/** Hex id for the `x-request-id` header; used for log correlation only, never for security. */
export function createRequestId(): string {
  const { crypto } = globalThis as { crypto?: WebCrypto };
  if (typeof crypto?.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(bytes, (byte: number) => byte.toString(16).padStart(2, '0')).join('');
  }
  // No CSPRNG available: a timestamp + counter is unique enough for correlation.
  fallbackCounter += 1;
  return `${Date.now().toString(16)}${fallbackCounter.toString(16).padStart(4, '0')}`.padStart(
    16,
    '0',
  );
}
