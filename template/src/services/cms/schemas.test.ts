import { logger } from '@services/logger/logger';

import { CmsEntryError, parseCmsEntries, parseCmsEntry } from './schemas';

const entry = {
  id: 3,
  type: 'announcement',
  slug: null,
  locale: 'de',
  availableLocales: ['en', 'de'],
  fallbackFields: ['title'],
  updatedAt: '2026-11-24T12:00:00Z',
  publishedAt: null,
  fields: {
    title: 'Hello',
    body: '**Welcome**',
    ctaLabel: null,
    image: {
      id: 'upload',
      url: 'https://example.org/media/upload',
      name: 'hello.png',
      mime: 'image/png',
      size: 1024,
    },
  },
};

test('AC-C-1: parses the engine envelope and normalizes optional announcement fields and media', () => {
  expect(parseCmsEntry('announcement', entry)).toEqual({
    ...entry,
    fields: { title: 'Hello', body: '**Welcome**', image: { url: entry.fields.image.url } },
  });
  expect(
    parseCmsEntry('announcement', { ...entry, fields: { title: 'Hello', image: null } }).fields
      .image,
  ).toBeUndefined();
});

test('AC-C-1: skips malformed and unknown items without logging document content or losing the cursor', () => {
  const warn = jest.spyOn(logger, 'warn').mockImplementation(jest.fn());
  try {
    const bad = { ...entry, slug: 'private-slug', fields: { body: 'private-content' } };
    const page = parseCmsEntries('announcement', {
      items: [bad, { ...entry, type: 'unknown' }, entry],
      nextCursor: '3',
    });
    expect(page).toEqual({ items: [parseCmsEntry('announcement', entry)], nextCursor: '3' });
    expect(warn.mock.calls).toEqual(
      [0, 1].map((index) => ['Skipping invalid CMS entry', { index, code: 'invalid' }]),
    );
  } finally {
    warn.mockRestore();
  }
});

test('AC-C-1: single reads distinguish missing entries from invalid or unknown entries', () => {
  expect(() => parseCmsEntry('announcement', null)).toThrow(new CmsEntryError('not-found'));
  expect(() => parseCmsEntry('announcement', { ...entry, fields: {} })).toThrow(CmsEntryError);
  expect(() => parseCmsEntry('announcement', { ...entry, type: 'unknown' })).toThrow(
    new CmsEntryError('invalid'),
  );
});
