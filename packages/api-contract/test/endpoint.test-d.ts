import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';

import { defineEndpoint, type Db, type RequestHeaders } from '../src/index.ts';

const Item = z.object({ id: z.number(), title: z.string(), createdAt: z.coerce.date() });

test('data must return the response input type', () => {
  defineEndpoint({
    method: 'GET',
    path: '/items/:id',
    params: z.object({ id: z.coerce.number() }),
    response: Item,
    // z.coerce.date() accepts a string as input, so an ISO string is fine here.
    data: ({ params }) => ({ id: params.id, title: 'x', createdAt: '2020-01-01' }),
  });

  defineEndpoint({
    method: 'GET',
    path: '/items/:id',
    response: Item,
    // @ts-expect-error title must be a string
    data: () => ({ id: 1, title: 2, createdAt: '2020-01-01' }),
  });

  defineEndpoint({
    method: 'GET',
    path: '/items/:id',
    response: Item,
    data: async () => ({ id: 1, title: 'x', createdAt: new Date() }),
  });

  defineEndpoint({
    method: 'GET',
    path: '/items/:id',
    response: Item,
    // @ts-expect-error a promise of a wrong value is also rejected
    data: async () => ({ id: 'one', title: 'x', createdAt: new Date() }),
  });
});

test('the context is typed from the schemas', () => {
  defineEndpoint({
    method: 'POST',
    path: '/items',
    params: z.object({ id: z.coerce.number() }),
    query: z.object({ page: z.coerce.number().default(1) }),
    body: z.object({ title: z.string() }),
    response: Item,
    data: (ctx) => {
      expectTypeOf(ctx.params).toEqualTypeOf<{ id: number }>();
      expectTypeOf(ctx.query).toEqualTypeOf<{ page: number }>();
      expectTypeOf(ctx.body).toEqualTypeOf<{ title: string }>();
      expectTypeOf(ctx.db).toEqualTypeOf<Db>();
      expectTypeOf(ctx.headers).toEqualTypeOf<RequestHeaders>();
      return { id: ctx.params.id, title: ctx.body.title, createdAt: new Date() };
    },
  });
});

test('absent schemas fall back to loose types', () => {
  defineEndpoint({
    method: 'GET',
    path: '/items',
    response: z.array(Item),
    data: (ctx) => {
      expectTypeOf(ctx.params).toEqualTypeOf<Record<string, string>>();
      expectTypeOf(ctx.body).toEqualTypeOf<undefined>();
      return [];
    },
  });
});
