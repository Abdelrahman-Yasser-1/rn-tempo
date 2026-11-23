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

/** Builds the stable endpoint id, `get.products.:id` for `GET /products/:id`. */
export function endpointId(method: string, path: string): string {
  const segments = path.split('/').filter((segment) => segment !== '');
  return [method.toLowerCase(), ...segments].join('.');
}
