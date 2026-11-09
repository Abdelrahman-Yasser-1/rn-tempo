import { keyFromSelector } from 'i18next';
import { z } from 'zod';

import { isoDateSchema } from '@shared/utils/schemas';

// Messages are keys of the `validation` namespace (see `@shared/utils/schemas`).
const MESSAGES = {
  titleRequired: keyFromSelector(($) => $.item.titleRequired, { ns: 'validation' }),
  priceInvalid: keyFromSelector(($) => $.item.priceInvalid, { ns: 'validation' }),
  descriptionRequired: keyFromSelector(($) => $.item.descriptionRequired, { ns: 'validation' }),
  categoryRequired: keyFromSelector(($) => $.item.categoryRequired, { ns: 'validation' }),
  quantityInvalid: keyFromSelector(($) => $.item.quantityInvalid, { ns: 'validation' }),
};

/** Contract C13 `Item`. */
export const ItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string(),
  price: z.number(),
  category: z.string(),
  thumbnail: z.string(),
  rating: z.number(),
  stock: z.number(),
});

export type Item = z.infer<typeof ItemSchema>;

export const ItemsPageSchema = z.object({
  products: z.array(ItemSchema),
  total: z.number(),
  skip: z.number(),
  limit: z.number(),
});

export type ItemsPage = z.infer<typeof ItemsPageSchema>;

export const CreateItemSchema = z.object({
  title: z.string().trim().min(1, MESSAGES.titleRequired),
  price: z.coerce.number(MESSAGES.priceInvalid).positive(MESSAGES.priceInvalid),
  description: z.string().trim().min(1, MESSAGES.descriptionRequired),
  category: z.string().trim().min(1, MESSAGES.categoryRequired),
  quantity: z
    .number(MESSAGES.quantityInvalid)
    .int(MESSAGES.quantityInvalid)
    .min(1, MESSAGES.quantityInvalid),
  tags: z.array(z.string()),
  /** Day the item is available from (`YYYY-MM-DD`); empty when not set. */
  availableFrom: isoDateSchema.or(z.literal('')).optional(),
  /** Pickup time slot (`HH:mm`); empty when not set. */
  pickupSlot: z.string().optional(),
  // @tempo-feature:file-picker:start
  /** Optional attachment as picked (`uri`, `name`, `type`, `size`); `null` when none. */
  attachment: z
    .object({ uri: z.string(), name: z.string(), type: z.string(), size: z.number() })
    .nullable()
    .optional(),
  // @tempo-feature:file-picker:end
  // @tempo-feature:maps:start
  /** Optional pickup place; `null` when none. */
  pickupLocation: z
    .object({ latitude: z.number(), longitude: z.number(), address: z.string().optional() })
    .nullable()
    .optional(),
  // @tempo-feature:maps:end
});

/** dummyjson echoes only the sent fields plus the new id, so that is all the app relies on. */
export const CreatedItemSchema = z.object({ id: z.number() });

/** The form values: `price` is typed text until the schema coerces it. `tags` hold the ids of `ITEM_TAGS`. */
export type CreateItemInput = z.input<typeof CreateItemSchema>;
export type CreateItem = z.output<typeof CreateItemSchema>;
