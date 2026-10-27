export type RetryOptions = {
  /** Extra attempts after the first one. Defaults to 3. */
  retries?: number;
  /** Delay before the first retry. Defaults to 300 ms. */
  delayMs?: number;
  /** Multiplier applied to the delay after each retry. Defaults to 2. */
  backoff?: number;
};

/** Resolves after `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Runs `fn`, retrying on rejection with exponential backoff. Throws the last error. */
export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  { retries = 3, delayMs = 300, backoff = 2 }: Readonly<RetryOptions> = {},
): Promise<T> {
  let delay = delayMs;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= retries) {
        throw error;
      }
      await sleep(delay);
      delay *= backoff;
    }
  }
}
