import type { z } from 'zod';

/** One invalid field of a request. `path` starts with the part: `body.email`, `query.limit`. */
export interface FieldIssue {
  path: string;
  message: string;
}

/** An RFC 9457 problem details object, sent as `application/problem+json`. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  errors?: FieldIssue[];
}

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

const TITLES: Readonly<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

/** Builds a problem details object. The title defaults to the status text. */
export function problem(
  status: number,
  options: { title?: string; detail?: string; type?: string; errors?: FieldIssue[] } = {},
): ProblemDetails {
  return {
    type: options.type ?? 'about:blank',
    title: options.title ?? TITLES[status] ?? 'Error',
    status,
    ...(options.detail === undefined ? {} : { detail: options.detail }),
    ...(options.errors === undefined ? {} : { errors: options.errors }),
  };
}

/** Throw this from a `data` function to answer with an error status instead of a body. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail?: string;
  readonly errors?: FieldIssue[];

  constructor(status: number, detail?: string, errors?: FieldIssue[]) {
    super(detail ?? TITLES[status] ?? 'Error');
    this.name = 'ApiError';
    this.status = status;
    if (detail !== undefined) this.detail = detail;
    if (errors !== undefined) this.errors = errors;
  }

  /** The problem+json body for this error. */
  toProblem(): ProblemDetails {
    return problem(this.status, {
      ...(this.detail === undefined ? {} : { detail: this.detail }),
      ...(this.errors === undefined ? {} : { errors: this.errors }),
    });
  }
}

/** Formats a Zod issue path as `a.b[0].c`, prefixed with the request part. */
export function formatPath(part: string, path: readonly PropertyKey[]): string {
  let out = part;
  for (const key of path) {
    out += typeof key === 'number' ? `[${key}]` : `.${String(key)}`;
  }
  return out;
}

/** Converts a Zod error into field issues for problem+json. */
export function issuesFromZod(part: string, error: z.ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({ path: formatPath(part, issue.path), message: issue.message }));
}
