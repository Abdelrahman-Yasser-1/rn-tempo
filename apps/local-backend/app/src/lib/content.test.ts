import { describe, expect, it } from 'vitest';

import type { ContentTypeDef } from '../api/types';

import { entryBody, entryToForm, fromLocalInput, isBlankLocale, localeFromForm, missingForPublish, toLocalInput } from './content';

const type: ContentTypeDef = {
  name: 'article',
  localized: true,
  fields: [
    { name: 'title', type: 'string', required: true },
    { name: 'views', type: 'number' },
    { name: 'featured', type: 'boolean' },
    { name: 'meta', type: 'json' },
    { name: 'tags', type: 'list' },
    { name: 'body', type: 'richText' },
  ],
};

describe('content forms', () => {
  it('turns saved values into text and back', () => {
    const form = entryToForm(type, ['en', 'ar'], { en: { title: 'Hi', views: 3, featured: false, meta: { a: 1 }, tags: ['x', 'y'], body: '  keep spaces\n' } });
    expect(form.en).toEqual({ title: 'Hi', views: '3', featured: 'false', meta: '{\n  "a": 1\n}', tags: 'x\ny', body: '  keep spaces\n' });
    expect(form.ar).toEqual({ title: '', views: '', featured: '', meta: '', tags: '', body: '' });
    const { data, problems } = localeFromForm(type, form.en ?? {});
    expect(problems).toEqual({});
    expect(data).toEqual({ title: 'Hi', views: 3, featured: false, meta: { a: 1 }, tags: ['x', 'y'], body: '  keep spaces\n' });
  });

  it('leaves empty fields out and names unreadable ones', () => {
    expect(localeFromForm(type, { title: '', views: '', featured: '', meta: '', tags: '', body: '' })).toEqual({ data: {}, problems: {} });
    expect(localeFromForm(type, { title: 'x', views: 'abc', meta: '{', tags: '\n\n' }).problems).toEqual({ views: 'Must be a number.', meta: 'Must be valid JSON.' });
  });

  it('sends null for a language that was saved and is now empty, and nothing for one that never existed', () => {
    const saved = { id: 1, type: 'article', slug: null, status: 'draft' as const, publishAt: null, createdAt: '', updatedAt: '', version: 1, values: { ar: { title: 'x' } } };
    const form = entryToForm(type, ['en', 'ar'], {});
    expect(entryBody(type, ['en', 'ar'], form, ' ', saved).body).toEqual({ slug: null, values: { ar: null } });
    expect(entryBody(type, ['en', 'ar'], form, 'a-slug', undefined).body).toEqual({ slug: 'a-slug', values: {} });
  });

  it('knows an empty language and a missing required field', () => {
    expect(isBlankLocale(undefined)).toBe(true);
    expect(isBlankLocale({ title: ' ' })).toBe(true);
    expect(isBlankLocale({ title: 'x' })).toBe(false);
    expect(missingForPublish(type, { en: { title: '' } }, 'en')).toEqual(['title']);
    expect(missingForPublish(type, { en: { title: 'x' } }, 'en')).toEqual([]);
  });

  it('converts a date-time input to ISO and back', () => {
    const iso = fromLocalInput('2026-12-01T09:30');
    expect(iso).toBe(new Date('2026-12-01T09:30').toISOString());
    expect(toLocalInput(iso)).toBe('2026-12-01T09:30');
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('nope')).toBeNull();
    expect(toLocalInput(null)).toBe('');
  });
});
