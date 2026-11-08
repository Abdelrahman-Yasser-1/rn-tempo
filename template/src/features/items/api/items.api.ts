import { ITEMS_PAGE_SIZE } from '@features/items/constants';
import {
  CreatedItemSchema,
  ItemSchema,
  ItemsPageSchema,
  type CreateItem,
} from '@features/items/types';
import { request } from '@services/http/request';

type FetchItemsParams = Readonly<{ q: string; skip: number; limit?: number }>;

/** One page of items; a non-empty `q` switches to the server-side title search. */
export function fetchItems({ q, skip, limit = ITEMS_PAGE_SIZE }: FetchItemsParams) {
  const query = q.trim();
  return request(
    {
      method: 'GET',
      url: query === '' ? '/products' : '/products/search',
      params: query === '' ? { limit, skip } : { q: query, limit, skip },
    },
    ItemsPageSchema,
  );
}

export function fetchItem(id: number) {
  return request({ method: 'GET', url: `/products/${String(id)}` }, ItemSchema);
}

export function createItem(body: Readonly<CreateItem>) {
  return request({ method: 'POST', url: '/products/add', data: body }, CreatedItemSchema);
}
