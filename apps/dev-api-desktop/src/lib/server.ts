import type { Client } from '../client/client';
import type { HttpReply, HttpRequest } from '../client/types';

import { errorMessage } from './errors';

/** What the dev API's control routes answer on a failure (problem+json). */
function problemDetail(text: string): string | null {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value === 'object' && value !== null) {
      const record = value as Record<string, unknown>;
      for (const key of ['detail', 'message', 'title']) {
        const field = record[key];
        if (typeof field === 'string') return field;
      }
    }
  } catch {
    // Not JSON: fall through.
  }
  return null;
}

/** Calls a control route and parses the JSON. A non-2xx answer becomes an `Error` with the server's reason. */
export async function controlJson<T>(client: Client, project: string, request: HttpRequest): Promise<T> {
  let reply: HttpReply;
  try {
    reply = await client.control(project, request);
  } catch (error) {
    throw new Error(errorMessage(error), { cause: error });
  }
  if (reply.status < 200 || reply.status > 299) {
    throw new Error(problemDetail(reply.body) ?? `The server answered ${reply.status}.`);
  }
  return JSON.parse(reply.body) as T;
}

export const jsonHeaders: [string, string][] = [['content-type', 'application/json']];
