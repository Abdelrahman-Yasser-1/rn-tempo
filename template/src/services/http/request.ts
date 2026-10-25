import type { AxiosRequestConfig } from 'axios';
import type { z } from 'zod';

import { logger } from '@services/logger/logger';

import { httpClient } from './client';
import { ApiError, normalizeError } from './errors';

/** Performs a request and validates the response body with Zod; failures are always `ApiError`. */
export async function request<T>(config: AxiosRequestConfig, schema: z.ZodType<T>): Promise<T> {
  let data: unknown;
  try {
    ({ data } = await httpClient.request(config));
  } catch (error) {
    throw normalizeError(error);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    // Contract drift between app and backend: surface it loudly in dev, generically in prod.
    logger.debug('Response did not match its schema', config.url, parsed.error.issues);
    throw new ApiError({
      code: 'UNKNOWN',
      message: 'Unexpected response from the server',
      details: parsed.error.issues,
    });
  }
  return parsed.data;
}
