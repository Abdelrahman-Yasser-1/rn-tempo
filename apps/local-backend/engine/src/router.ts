import type { Endpoint, EndpointMethod, HttpMethod } from './schema.ts';
import type { Reply, RequestCtx } from './http.ts';

export type Params = Record<string, string>;
export type Handler = (ctx: RequestCtx, params: Params) => Reply | Promise<Reply>;

interface Segment {
  literal?: string;
  param?: string;
}

export interface Route {
  endpoint: Endpoint;
  method: EndpointMethod;
  /** The path as served, with the base path in front. */
  mounted: string;
  segments: Segment[];
  handler: Handler;
}

export type Match =
  | { kind: 'found'; route: Route; params: Params }
  | { kind: 'method'; allowed: HttpMethod[] }
  | { kind: 'none' };

const split = (path: string): string[] => path.split('/').filter((part) => part !== '');

export function mountPath(basePath: string | undefined, path: string): string {
  const joined = `${basePath ?? ''}${path === '/' ? '' : path}`;
  return joined === '' ? '/' : joined;
}

function compile(path: string): Segment[] {
  return split(path).map((part) => (part.startsWith(':') ? { param: part.slice(1) } : { literal: part }));
}

function decode(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

/** An immutable route table. A new definition builds a new one; requests already matched keep the old. */
export class Router {
  private readonly routes: Route[];

  constructor(routes: { endpoint: Endpoint; path: string; handler: Handler }[], basePath: string | undefined) {
    this.routes = routes
      .map(({ endpoint, path, handler }) => {
        const mounted = mountPath(basePath, path);
        return { endpoint, method: endpoint.method, mounted, segments: compile(mounted), handler };
      })
      // Literal segments before `:param` ones, so `/products/search` wins over `/products/:id`.
      .sort((a, b) => {
        if (a.segments.length !== b.segments.length) return a.segments.length - b.segments.length;
        for (let i = 0; i < a.segments.length; i += 1) {
          const left = a.segments[i]?.literal !== undefined;
          const right = b.segments[i]?.literal !== undefined;
          if (left !== right) return left ? -1 : 1;
        }
        return 0;
      });
  }

  match(method: string, path: string): Match {
    const parts = split(path);
    const allowed: HttpMethod[] = [];
    for (const route of this.routes) {
      if (route.segments.length !== parts.length) continue;
      const params: Params = {};
      let ok = true;
      for (let i = 0; i < parts.length && ok; i += 1) {
        const segment = route.segments[i];
        const part = parts[i];
        if (segment === undefined || part === undefined) ok = false;
        else if (segment.literal !== undefined) ok = segment.literal === part;
        else {
          const value = decode(part);
          if (value === undefined) ok = false;
          else params[segment.param ?? ''] = value;
        }
      }
      if (!ok) continue;
      if (route.method === method || route.method === 'ANY') return { kind: 'found', route, params };
      if (!allowed.includes(route.method)) allowed.push(route.method);
    }
    return allowed.length > 0 ? { kind: 'method', allowed } : { kind: 'none' };
  }

  get endpoints(): Endpoint[] {
    return [...new Set(this.routes.map((route) => route.endpoint))];
  }
}
