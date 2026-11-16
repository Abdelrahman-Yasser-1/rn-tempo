import { ApiError, defineEndpoint } from '@rn-tempo/api-contract';
import { z } from 'zod';

import { ItemSchema, ItemsPageSchema } from '@features/items/api/schemas';

type Item = z.infer<typeof ItemSchema>;

const CATALOG_SIZE = 100;
const NEW_ITEM_ID = CATALOG_SIZE + 1;
const DEFAULT_LIMIT = 30;
const CATEGORIES = ['beauty', 'fragrances', 'furniture', 'groceries'] as const;

/** Pure builder: item `n` is always the same, so tests can rely on ids, titles and categories. */
function buildItem(n: number): Item {
  const title = `Product ${String(n)}`;
  return {
    id: n,
    title,
    description: `Description of product ${String(n)}`,
    price: 5 + n,
    category: CATEGORIES[(n - 1) % CATEGORIES.length] ?? 'beauty',
    thumbnail: `https://dummyjson.com/image/200x200?text=${encodeURIComponent(title)}`,
    rating: 3 + (n % 20) / 10,
    stock: 10 + (n % 50),
  };
}

const catalog: Item[] = Array.from({ length: CATALOG_SIZE }, (_, index) => buildItem(index + 1));

/** A count, or `fallback` when it is missing or not a whole number of at least 0. */
const countSchema = z.coerce.number().int().min(0).optional().catch(undefined);

const PageQuerySchema = z.object({ limit: countSchema, skip: countSchema });
const SearchQuerySchema = PageQuerySchema.extend({ q: z.string().optional() });

function page(items: Item[], query: z.output<typeof PageQuerySchema>) {
  const limit = query.limit ?? DEFAULT_LIMIT;
  const skip = query.skip ?? 0;
  return { products: items.slice(skip, skip + limit), total: items.length, skip, limit };
}

// `/products/search` is listed before `/products/:id`; the runtime also orders static segments first.
export const searchProducts = defineEndpoint({
  method: 'GET',
  path: '/products/search',
  summary: 'Search products by title',
  tags: ['products'],
  query: SearchQuerySchema,
  response: ItemsPageSchema,
  data: ({ query }) => {
    const needle = (query.q ?? '').toLowerCase();
    return page(
      catalog.filter((item) => item.title.toLowerCase().includes(needle)),
      query,
    );
  },
});

export const listProducts = defineEndpoint({
  method: 'GET',
  path: '/products',
  summary: 'List products',
  tags: ['products'],
  query: PageQuerySchema,
  response: ItemsPageSchema,
  data: ({ query }) => page(catalog, query),
});

export const getProduct = defineEndpoint({
  method: 'GET',
  path: '/products/:id',
  summary: 'Get one product',
  tags: ['products'],
  params: z.object({ id: z.string() }),
  response: ItemSchema,
  data: ({ params }) => {
    const item = catalog.find((candidate) => candidate.id === Number(params.id));
    if (!item) {
      throw new ApiError(404, `Product with id '${params.id}' not found`);
    }
    return item;
  },
});

export const addProduct = defineEndpoint({
  method: 'POST',
  path: '/products/add',
  summary: 'Add a product',
  tags: ['products'],
  status: 201,
  body: z.looseObject({
    title: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
  }),
  response: ItemSchema.partial().required({ id: true }),
  data: ({ body }) => ({
    thumbnail: buildItem(NEW_ITEM_ID).thumbnail,
    rating: 0,
    stock: 0,
    ...body,
    id: NEW_ITEM_ID,
  }),
});
