import type { IncomingHttpHeaders } from 'node:http';

import { problem, PROBLEM_CONTENT_TYPE, type FieldIssue } from '@rn-tempo/api-contract';

/** A request as the engine sees it: the listener has already read the (size-limited) body. */
export interface RequestCtx {
  method: string;
  /** The path without the query string. */
  path: string;
  /** The URL as received, for logs (redact before storing). */
  url: string;
  query: URLSearchParams;
  headers: IncomingHttpHeaders;
  bodyText: string;
}

export interface Reply {
  status: number;
  headers: Record<string, string>;
  /** Sent as JSON. `undefined` sends no body. */
  body?: unknown;
  /** The scenario that shaped this reply. */
  scenario?: string;
}

export const jsonReply = (status: number, body: unknown, headers: Record<string, string> = {}): Reply => ({
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  body,
});

/** An RFC 9457 problem. `message` repeats `detail` for clients written against dummyjson's `{ message }` errors. */
export function problemReply(
  status: number,
  options: { title?: string; detail?: string; errors?: FieldIssue[]; headers?: Record<string, string>; extra?: Record<string, unknown> } = {},
): Reply {
  const body = problem(status, {
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.detail === undefined ? {} : { detail: options.detail }),
    ...(options.errors === undefined ? {} : { errors: options.errors }),
  });
  return {
    status,
    headers: { 'content-type': PROBLEM_CONTENT_TYPE, ...options.headers },
    body: { ...body, message: body.detail ?? body.title, ...options.extra },
  };
}

export type JsonBody = { ok: true; value: unknown } | { ok: false; reply: Reply };

/** The JSON body of a request. An empty body is `undefined`; anything else must be valid JSON. */
export function readJson(ctx: RequestCtx): JsonBody {
  if (ctx.bodyText.trim() === '') return { ok: true, value: undefined };
  const type = String(ctx.headers['content-type'] ?? '');
  if (type !== '' && !/json/i.test(type)) {
    return { ok: false, reply: problemReply(415, { title: 'Unsupported Media Type', detail: 'Send the body as application/json.' }) };
  }
  try {
    return { ok: true, value: JSON.parse(ctx.bodyText) as unknown };
  } catch {
    return { ok: false, reply: problemReply(400, { detail: 'The request body is not valid JSON.' }) };
  }
}

/** What goes into the request log for a request body: parsed JSON, or a placeholder (never raw text). */
export function loggableBody(ctx: RequestCtx): unknown {
  if (ctx.bodyText === '') return undefined;
  try {
    return JSON.parse(ctx.bodyText) as unknown;
  } catch {
    return `[${Buffer.byteLength(ctx.bodyText)} bytes, not JSON]`;
  }
}
