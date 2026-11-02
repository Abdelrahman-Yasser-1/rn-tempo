import { UserSchema } from '@features/auth';

// @tempo-feature:samples:start
import { createItem } from './item';
// @tempo-feature:samples:end
import { createUser } from './user';

describe('factories', () => {
  test('createUser builds schema-valid, unique users with overrides', () => {
    const first = createUser();
    const second = createUser({ firstName: 'Emily' });

    expect(UserSchema.safeParse(first).success).toBe(true);
    expect(second.firstName).toBe('Emily');
    expect(second.id).not.toBe(first.id);
  });

  // @tempo-feature:samples:start
  test('createItem builds unique items with overrides', () => {
    const first = createItem();
    const second = createItem({ price: 1 });

    expect(second.price).toBe(1);
    expect(second.id).not.toBe(first.id);
    expect(first.title).toContain('Item');
  });
  // @tempo-feature:samples:end
});
