import type { z } from 'zod';

import type {
  AnyDataContext,
  DataContext,
  EndpointDefinition,
  HttpMethod,
  ResourceBinding,
  Scenario,
} from './types.ts';

/** Builds the stable endpoint id, `get.products.:id` for `GET /products/:id`. */
export function endpointId(method: HttpMethod, path: string): string {
  const segments = path.split('/').filter((segment) => segment !== '');
  return [method.toLowerCase(), ...segments].join('.');
}

/** The options of `defineEndpoint`. `data` must return what `response` accepts as input. */
export interface EndpointInput<
  P extends z.ZodType | undefined,
  Q extends z.ZodType | undefined,
  B extends z.ZodType | undefined,
  R extends z.ZodType,
> {
  method: HttpMethod;
  /** Express-style path with `:param` segments, e.g. `/products/:id`. */
  path: string;
  /** Overrides the generated id (`<method>.<path>`). */
  id?: string;
  params?: P;
  query?: Q;
  body?: B;
  response: R;
  /** Success status. Defaults to 200. */
  status?: number;
  auth?: 'bearer';
  /**
   * Fixed data. Typed with the response's input type, so a value the schema would reject is a
   * compile error. Leave it out to get generated data.
   */
  data?: (ctx: DataContext<P, Q, B>) => z.input<R> | Promise<z.input<R>>;
  scenarios?: Record<string, Scenario>;
  summary?: string;
  tags?: readonly string[];
  /** Set by `resource`; not for direct use. */
  resource?: ResourceBinding;
}

/**
 * Defines one endpoint. The result is plain data that the dev API, the real backend and the
 * generators all read.
 */
export function defineEndpoint<
  P extends z.ZodType | undefined = undefined,
  Q extends z.ZodType | undefined = undefined,
  B extends z.ZodType | undefined = undefined,
  R extends z.ZodType = z.ZodType,
>(input: EndpointInput<P, Q, B, R>): EndpointDefinition<P, Q, B, R> {
  if (!input.path.startsWith('/')) {
    throw new Error(`Endpoint path must start with "/": ${input.path}`);
  }
  const status = input.status ?? 200;
  return {
    id: input.id ?? endpointId(input.method, input.path),
    method: input.method,
    path: input.path,
    ...(input.params === undefined ? {} : { params: input.params }),
    ...(input.query === undefined ? {} : { query: input.query }),
    ...(input.body === undefined ? {} : { body: input.body }),
    response: input.response,
    status,
    ...(input.auth === undefined ? {} : { auth: input.auth }),
    // The typed context is narrower than what the server passes; the server always validates first.
    ...(input.data === undefined ? {} : { data: input.data as (ctx: AnyDataContext) => unknown }),
    scenarios: input.scenarios ?? {},
    ...(input.summary === undefined ? {} : { summary: input.summary }),
    ...(input.tags === undefined ? {} : { tags: input.tags }),
    ...(input.resource === undefined ? {} : { resource: input.resource }),
  };
}
