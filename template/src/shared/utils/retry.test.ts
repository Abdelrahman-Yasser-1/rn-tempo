import { retry, sleep } from './retry';

const FAILURE = new Error('down');

describe('sleep', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves after the given delay', async () => {
    const onResolved = jest.fn<unknown, []>();
    const pending = sleep(500).then(onResolved);
    await jest.advanceTimersByTimeAsync(499);
    expect(onResolved).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await pending;
    expect(onResolved).toHaveBeenCalledTimes(1);
  });
});

describe('retry', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the first success without retrying', async () => {
    const fn = jest.fn(() => Promise.resolve('ok'));
    await expect(retry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries with exponential backoff until the call succeeds', async () => {
    const fn = jest
      .fn<Promise<string>, [number]>()
      .mockRejectedValueOnce(FAILURE)
      .mockRejectedValueOnce(FAILURE)
      .mockResolvedValueOnce('done');

    const result = retry(fn, { delayMs: 100, backoff: 2 });
    await jest.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(100);
    expect(fn).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(199);
    expect(fn).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toBe('done');
    expect(fn.mock.calls.map(([attempt]) => attempt)).toEqual([0, 1, 2]);
  });

  it('throws the last error once the retries are used up', async () => {
    const fn = jest.fn(() => Promise.reject(FAILURE));
    const settled = retry(fn, { retries: 2, delayMs: 10 }).catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(1000);
    await expect(settled).resolves.toBe(FAILURE);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('makes exactly one attempt when retries is 0', async () => {
    const fn = jest.fn(() => Promise.reject(FAILURE));
    const settled = retry(fn, { retries: 0 }).catch((error: unknown) => error);
    await jest.advanceTimersByTimeAsync(0);
    await expect(settled).resolves.toBe(FAILURE);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
