import { z } from 'zod';

import { isoDateSchema } from '@shared/utils/schemas';

// Keys of the `validation` namespace, declared here so the i18n extractor keeps them.
// t('item.titleRequired', { ns: 'validation', defaultValue: 'Enter a title.' })
// t('item.priceInvalid', { ns: 'validation', defaultValue: 'Enter a price greater than 0.' })
// t('item.descriptionRequired', { ns: 'validation', defaultValue: 'Enter a description.' })
// t('item.categoryRequired', { ns: 'validation', defaultValue: 'Enter a category.' })
// t('item.quantityInvalid', { ns: 'validation', defaultValue: 'Enter a quantity of at least 1.' })

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
  title: z.string().trim().min(1, 'item.titleRequired'),
  price: z.coerce.number('item.priceInvalid').positive('item.priceInvalid'),
  description: z.string().trim().min(1, 'item.descriptionRequired'),
  category: z.string().trim().min(1, 'item.categoryRequired'),
  quantity: z
    .number('item.quantityInvalid')
    .int('item.quantityInvalid')
    .min(1, 'item.quantityInvalid'),
  tags: z.array(z.string()),
  /** Day the item is available from (`YYYY-MM-DD`); empty when not set. */
  availableFrom: isoDateSchema.or(z.literal('')).optional(),
  /** Pickup time slot (`HH:mm`); empty when not set. */
  pickupSlot: z.string().optional(),
});

/** dummyjson echoes only the sent fields plus the new id, so that is all the app relies on. */
export const CreatedItemSchema = z.object({ id: z.number() });

/** The form values: `price` is typed text until the schema coerces it. `tags` hold the ids of `ITEM_TAGS`. */
export type CreateItemInput = z.input<typeof CreateItemSchema>;
export type CreateItem = z.output<typeof CreateItemSchema>;
