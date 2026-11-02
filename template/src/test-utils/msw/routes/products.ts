import type { Item } from '@features/items';

import type { MockRoute } from './types';

const CATALOG_SIZE = 100;
const NEW_ITEM_ID = CATALOG_SIZE + 1;
const DEFAULT_LIMIT = 30;
const CATEGORIES = ['beauty', 'fragrances', 'furniture', 'groceries'] as const;

/** Pure builder: item `n` is always the same, so tests can rely on ids, titles and categories. */
function buildItem(n: number): Item {
  return {
    id: n,
    title: `Product ${String(n)}`,
    description: `Description of product ${String(n)}`,
    price: 5 + n,
    category: CATEGORIES[(n - 1) % CATEGORIES.length] ?? 'beauty',
    thumbnail: `https://cdn.dummyjson.com/product-images/${String(n)}/thumbnail.webp`,
    rating: 3 + (n % 20) / 10,
    stock: 10 + (n % 50),
  };
}

const catalog: Item[] = Array.from({ length: CATALOG_SIZE }, (_, index) => buildItem(index + 1));

const asRecord = (body: unknown): Record<string, unknown> =>
  typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

const toCount = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return value !== undefined && Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

function page(items: Item[], query: Record<string, string>) {
  const limit = toCount(query.limit, DEFAULT_LIMIT);
  const skip = toCount(query.skip, 0);
  return {
    status: 200,
    body: { products: items.slice(skip, skip + limit), total: items.length, skip, limit },
  };
}

export const productRoutes: MockRoute[] = [
  // `/products/search` must stay before `/products/:id`, or "search" would match as an id.
  {
    method: 'get',
    path: '/products/search',
    resolve: ({ query }) => {
      const needle = (query.q ?? '').toLowerCase();
      return page(
        catalog.filter((item) => item.title.toLowerCase().includes(needle)),
        query,
      );
    },
  },
  { method: 'get', path: '/products', resolve: ({ query }) => page(catalog, query) },
  {
    method: 'get',
    path: '/products/:id',
    resolve: ({ params }) => {
      const item = catalog.find((candidate) => candidate.id === Number(params.id));
      return item
        ? { status: 200, body: item }
        : { status: 404, body: { message: `Product with id '${params.id ?? ''}' not found` } };
    },
  },
  {
    method: 'post',
    path: '/products/add',
    resolve: ({ body }) => ({
      status: 201,
      body: {
        thumbnail: buildItem(NEW_ITEM_ID).thumbnail,
        rating: 0,
        stock: 0,
        ...asRecord(body),
        id: NEW_ITEM_ID,
      },
    }),
  },
];
