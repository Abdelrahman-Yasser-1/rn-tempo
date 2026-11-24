import { z } from 'zod';

import { logger } from '@services/logger/logger';

export const cmsEnvelopeSchema = z.object({
  id: z.union([z.int(), z.string().min(1)]),
  slug: z.string().nullable(),
  type: z.string(),
  locale: z.string().min(1),
  availableLocales: z.array(z.string()),
  fallbackFields: z.array(z.string()),
  fields: z.record(z.string(), z.unknown()),
  updatedAt: z.iso.datetime({ offset: true }),
  publishedAt: z.iso.datetime({ offset: true }).nullable(),
});

// Tempo serializes unset fields as null. Consumers see one optional-field convention.
const optionalText = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined);
const image = z.object({
  url: z.url(),
  alt: z.string().optional(),
  width: z.int().positive().optional(),
  height: z.int().positive().optional(),
});

export const cmsFieldSchemas = {
  announcement: z.object({
    title: z.string().min(1),
    body: optionalText,
    image: image.nullish().transform((value) => value ?? undefined),
    ctaLabel: optionalText,
    ctaUrl: optionalText,
  }),
};

export type CmsType = keyof typeof cmsFieldSchemas;
export type CmsEntry<T extends CmsType = CmsType> = Omit<
  z.infer<typeof cmsEnvelopeSchema>,
  'type' | 'fields'
> & { type: T; fields: z.infer<(typeof cmsFieldSchemas)[T]> };
export type CmsPage<T extends CmsType = CmsType> = {
  items: CmsEntry<T>[];
  nextCursor: string | null;
};

/** An expected read failure that a screen can map to a localized message. */
export class CmsEntryError extends Error {
  readonly isOperational = true;

  constructor(readonly code: 'not-found' | 'invalid') {
    super(code === 'not-found' ? 'CMS entry not found' : 'Invalid CMS entry');
    this.name = 'CmsEntryError';
  }
}

/** Validates a single document against the schema for the requested content type. */
export function parseCmsEntry<T extends CmsType>(type: T, raw: unknown): CmsEntry<T> {
  if (raw === null || raw === undefined) {
    throw new CmsEntryError('not-found');
  }
  const entry = cmsEnvelopeSchema.safeParse(raw);
  if (!entry.success || entry.data.type !== type || !Object.hasOwn(cmsFieldSchemas, type)) {
    throw new CmsEntryError('invalid');
  }
  const fields = cmsFieldSchemas[type].safeParse(entry.data.fields);
  if (!fields.success) {
    throw new CmsEntryError('invalid');
  }
  return { ...entry.data, type, fields: fields.data };
}

const pageSchema = z.object({ items: z.array(z.unknown()), nextCursor: z.string().nullable() });

/** Preserves the provider cursor even when every item on the page is invalid. */
export function parseCmsEntries<T extends CmsType>(type: T, raw: unknown): CmsPage<T> {
  const page = pageSchema.parse(raw);
  const items: CmsEntry<T>[] = [];
  for (const [index, item] of page.items.entries()) {
    try {
      items.push(parseCmsEntry(type, item));
    } catch (error) {
      if (!(error instanceof CmsEntryError)) {
        throw error;
      }
      // Document fields, identifiers and validation inputs may contain private content.
      logger.warn('Skipping invalid CMS entry', { index, code: error.code });
    }
  }
  return { items, nextCursor: page.nextCursor };
}
