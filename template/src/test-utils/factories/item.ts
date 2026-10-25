/** Contract C13 `Item`. The type lives here until WS9 adds the items feature schema. */
export type Item = {
  id: number;
  title: string;
  description: string;
  price: number;
  category: string;
  thumbnail: string;
  rating: number;
  stock: number;
};

let sequence = 0;

/** Builds a valid `Item`; pass overrides for the fields a test cares about. */
export function createItem(overrides: Partial<Item> = {}): Item {
  sequence += 1;
  const label = String(sequence);
  return {
    id: sequence,
    title: `Item ${label}`,
    description: `Description of item ${label}`,
    price: 9.99 + sequence,
    category: 'beauty',
    thumbnail: `https://example.test/items/${label}.png`,
    rating: 4.5,
    stock: 10,
    ...overrides,
  };
}
