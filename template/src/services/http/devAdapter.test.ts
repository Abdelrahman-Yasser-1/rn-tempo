import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';

import { ENV } from '@config/env';
import { initStorage, StorageNotReadyError, storage } from '@services/storage/storage';

import * as apiSource from './apiSource';
import { createSwitchingAdapter } from './devAdapter';

const realAdapter = jest.fn<ReturnType<AxiosAdapter>, Parameters<AxiosAdapter>>();
const mockAdapter = jest.fn<ReturnType<AxiosAdapter>, Parameters<AxiosAdapter>>();

jest.mock('./devMockAdapter', () => ({
  createDevMockAdapter: jest.fn(
    () =>
      (...args: Parameters<AxiosAdapter>) =>
        mockAdapter(...args),
  ),
}));

const config = { url: '/ping' } as InternalAxiosRequestConfig;

beforeAll(async () => {
  await initStorage();
});

beforeEach(() => {
  storage.clearAll();
  realAdapter.mockReset().mockResolvedValue({
    data: 'real',
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  });
  mockAdapter.mockReset().mockResolvedValue({
    data: 'mock',
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  });
  jest.spyOn(axios, 'getAdapter').mockReturnValue(realAdapter);
});

async function answerFor(source: apiSource.ApiSource | undefined, isMocking: boolean) {
  jest.replaceProperty(ENV, 'API_MOCKING', isMocking);
  if (source !== undefined) {
    apiSource.writeApiSource(source);
  }
  const response = await createSwitchingAdapter()(config);
  return response.data as string;
}

describe('createSwitchingAdapter', () => {
  test('env follows API_MOCKING, exactly as before the switch existed', async () => {
    expect(await answerFor(undefined, false)).toBe('real');
    expect(await answerFor('env', true)).toBe('mock');
  });

  test('mocks answers from the in-app mocks whatever API_MOCKING says', async () => {
    expect(await answerFor('mocks', false)).toBe('mock');
    expect(await answerFor('mocks', true)).toBe('mock');
  });

  test('dev-api never uses the mock adapter, even with API_MOCKING=true', async () => {
    expect(await answerFor('dev-api', true)).toBe('real');
    expect(mockAdapter).not.toHaveBeenCalled();
  });

  test('keeps the first choice for the launch, so a change applies after a restart', async () => {
    jest.replaceProperty(ENV, 'API_MOCKING', false);
    apiSource.writeApiSource('mocks');
    const adapter = createSwitchingAdapter();
    expect((await adapter(config)).data).toBe('mock');

    apiSource.writeApiSource('dev-api');
    expect((await adapter(config)).data).toBe('mock');
    expect((await createSwitchingAdapter()(config)).data).toBe('real');
  });

  test('before storage is open it follows env and looks again on the next request', async () => {
    jest.replaceProperty(ENV, 'API_MOCKING', false);
    apiSource.writeApiSource('mocks');
    const read = jest.spyOn(apiSource, 'readApiSource');
    read.mockImplementationOnce(() => {
      throw new StorageNotReadyError();
    });
    const adapter = createSwitchingAdapter();

    expect((await adapter(config)).data).toBe('real');
    read.mockRestore();
    expect((await adapter(config)).data).toBe('mock');
  });
});
