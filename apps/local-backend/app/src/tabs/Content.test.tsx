import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ContentConfig, ContentTypeDef, EntryDetail, EntrySummary, HttpRequest } from '../api/types';
import { adminRoutes, makeApi, reply, renderWithApi } from '../test/fakeApi';

import { Content } from './Content';

const config: ContentConfig = { mount: '/content', locales: ['en', 'ar'], defaultLocale: 'en', versionsKept: 10 };
const MEDIA_ID = 'a'.repeat(32);

const article: ContentTypeDef = {
  name: 'article',
  label: 'Article',
  localized: true,
  entries: 2,
  fields: [
    { name: 'title', type: 'string', required: true },
    { name: 'summary', type: 'text' },
    { name: 'body', type: 'richText' },
    { name: 'views', type: 'number' },
    { name: 'featured', type: 'boolean' },
    { name: 'publishedOn', type: 'date' },
    { name: 'kind', type: 'enum', enumValues: ['news', 'tip'] },
    { name: 'cover', type: 'media' },
    { name: 'meta', type: 'json' },
    { name: 'tags', type: 'list' },
  ],
};
const home: ContentTypeDef = { name: 'home', label: 'Home', singleton: true, localized: false, entries: 1, fields: [{ name: 'headline', type: 'string' }] };

const summary = (id: number, over: Partial<EntrySummary> = {}): EntrySummary => ({
  id,
  type: 'article',
  slug: null,
  status: 'draft',
  publishAt: null,
  createdAt: '2026-11-18T08:00:00.000Z',
  updatedAt: '2026-11-18T09:00:00.000Z',
  version: 1,
  title: `Entry ${String(id)}`,
  locales: ['en'],
  ...over,
});

const detail = (over: Partial<EntryDetail> = {}): EntryDetail => ({
  id: 1,
  type: 'article',
  slug: 'hello',
  status: 'draft',
  publishAt: null,
  createdAt: '2026-11-18T08:00:00.000Z',
  updatedAt: '2026-11-18T09:00:00.000Z',
  version: 2,
  values: { en: { title: 'Hello', body: 'Some **bold** text' } },
  ...over,
});

const versions = [
  { version: 2, reason: 'save', savedAt: '2026-11-18T09:00:00.000Z', slug: 'hello', locales: ['en'] },
  { version: 1, reason: 'create', savedAt: '2026-11-18T08:00:00.000Z', slug: 'hello', locales: ['en'] },
];

type Handler = (request: HttpRequest, params: Record<string, string>) => unknown;

function setup(extra: Record<string, Handler> = {}, types: ContentTypeDef[] = [article, home], entries: EntrySummary[] = [summary(1, { slug: 'hello', title: 'Hello', locales: ['en'] }), summary(2, { status: 'published', publishAt: '2026-11-18T09:00:00.000Z', locales: ['en', 'ar'] })]) {
  const seen: HttpRequest[] = [];
  const log = (answer: unknown): Handler => (request) => (seen.push(request), answer);
  const api = makeApi({
    admin: adminRoutes({
      'GET /content/config': () => config,
      'GET /content/types': () => types,
      'GET /content/entries': () => ({ items: entries, total: entries.length, skip: 0, limit: 200 }),
      'GET /content/entries/:id': () => detail(),
      'GET /content/entries/:id/versions': () => ({ items: versions }),
      'GET /media': () => ({ items: [{ id: MEDIA_ID, url: `/media/${MEDIA_ID}`, originalName: 'cat.png', mime: 'image/png', size: 100, createdAt: '2026-11-18T08:00:00Z' }], total: 1, skip: 0, limit: 60 }),
      'GET /media/:id': () => ({ id: MEDIA_ID, url: `/media/${MEDIA_ID}`, originalName: 'cat.png', mime: 'image/png', size: 100, createdAt: '2026-11-18T08:00:00Z' }),
      'POST /content/entries': log(detail({ id: 9, status: 'draft' })),
      'PUT /content/entries/:id': log(detail()),
      'POST /content/entries/:id/publish': log(detail({ status: 'published', publishAt: '2026-11-18T10:00:00.000Z' })),
      'POST /content/entries/:id/schedule': log(detail({ status: 'scheduled', publishAt: '2026-12-01T09:00:00.000Z' })),
      'POST /content/entries/:id/unpublish': log(detail({ status: 'draft' })),
      'POST /content/entries/:id/revert': log(detail({ version: 3 })),
      'DELETE /content/entries/:id': log({ id: 1 }),
      'POST /content/types': log({ ok: true }),
      'PUT /content/types/:name': log({ ok: true }),
      'DELETE /content/types/:name': log({ ok: true }),
      ...extra,
    }),
    mediaPreview: vi.fn(() => Promise.resolve(new ArrayBuffer(4))),
  });
  renderWithApi(<Content backend="/work/shop" />, api);
  return { api, seen };
}

const bodyOf = (request: HttpRequest | undefined): Record<string, unknown> => JSON.parse(request?.body ?? '{}') as Record<string, unknown>;

describe('Content tab: types and entries', () => {
  it('lists the types with their entry counts and the entries with a status badge', async () => {
    setup();
    const side = await screen.findByRole('complementary', { name: 'Content types' });
    expect(within(side).getByText('Article')).toBeInTheDocument();
    expect(within(side).getByText('Home')).toBeInTheDocument();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Draft')).toBeInTheDocument();
    expect(within(table).getByText('Published')).toBeInTheDocument();
    expect(within(table).getByText('Hello')).toBeInTheDocument();
    // The second entry has no Arabic text.
    expect(within(table).getByText('(missing: ar)', { exact: false })).toBeInTheDocument() ;
  });

  it('shows a Scheduled badge', async () => {
    setup({}, [article], [summary(3, { status: 'scheduled', publishAt: '2026-12-01T09:00:00.000Z' })]);
    expect(await screen.findByText('Scheduled')).toBeInTheDocument();
  });

  it('filters by status and by search text through the engine', async () => {
    const { api } = setup();
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'published');
    await userEvent.type(screen.getByRole('searchbox'), 'hel');
    await waitFor(() => {
      const paths = vi.mocked(api.admin).mock.calls.map(([, request]) => request.path);
      expect(paths.some((path) => path.includes('status=published') && path.includes('q=hel') && path.includes('type=article'))).toBe(true);
    });
  });

  it('a type that holds one entry cannot get a second', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: /^Home/ }));
    expect(await screen.findByText(/holds one entry/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add entry' })).toBeDisabled();
  });

  it('says what to do when there are no types', async () => {
    setup({}, [], []);
    expect(await screen.findByText(/No content types yet/)).toBeInTheDocument();
  });
});

describe('Content tab: the type editor', () => {
  it('adds a type with typed fields', async () => {
    const { seen } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Add type' }));
    const dialog = screen.getByRole('dialog', { name: 'Add a content type' });
    // A missing name is named without asking the engine.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add type' }));
    expect(await within(dialog).findByText('Give the type a name.')).toBeInTheDocument();
    expect(seen).toHaveLength(0);
    await userEvent.type(within(dialog).getByLabelText('Name'), 'faq');
    await userEvent.type(within(dialog).getByLabelText('Label (shown in this app)'), 'FAQ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add field' }));
    await userEvent.type(within(dialog).getByLabelText('Field name'), 'answer');
    await userEvent.selectOptions(within(dialog).getByLabelText('Type'), 'richText');
    await userEvent.click(within(dialog).getByLabelText('Needed to publish'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add field' }));
    const groups = within(dialog).getAllByRole('group', { name: /^Field / });
    await userEvent.type(within(groups[1] as HTMLElement).getByLabelText('Field name'), 'level');
    await userEvent.selectOptions(within(groups[1] as HTMLElement).getByLabelText('Type'), 'enum');
    await userEvent.type(within(groups[1] as HTMLElement).getByLabelText('Allowed values (commas)'), 'easy, hard');
    await userEvent.click(within(dialog).getByLabelText('Only one entry', { exact: false }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add type' }));
    await waitFor(() => {
      expect(seen).toHaveLength(1);
    });
    expect(seen[0]).toMatchObject({ method: 'POST', path: '/content/types' });
    expect(bodyOf(seen[0])).toEqual({
      name: 'faq',
      label: 'FAQ',
      localized: true,
      singleton: true,
      fields: [
        { name: 'answer', type: 'richText', required: true },
        { name: 'level', type: 'enum', enumValues: ['easy', 'hard'] },
      ],
    });
  });

  it('asks for the second confirm when removing a field would delete values, then repeats with confirm', async () => {
    const calls: string[] = [];
    setup({
      'PUT /content/types/:name': (request) => {
        calls.push(request.path);
        return request.path.includes('confirm=true')
          ? { ok: true }
          : reply({ detail: 'This change deletes data.', confirmRequired: true, lost: [{ kind: 'contentField', collection: 'article', field: 'tags', rows: 4 }] }, 409);
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Edit type' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Article' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove field tags' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save type' }));
    const loss = await screen.findByRole('dialog', { name: 'This deletes data' });
    expect(within(loss).getByText('The content field "article.tags" and its 4 saved values')).toBeInTheDocument();
    expect(calls).toEqual(['/content/types/article']);
    await userEvent.click(within(loss).getByRole('button', { name: 'Delete it' }));
    await waitFor(() => {
      expect(calls).toEqual(['/content/types/article', '/content/types/article?confirm=true']);
    });
  });

  it('deleting a type is confirmed twice: what goes, then what the engine would lose', async () => {
    const calls: string[] = [];
    setup({
      'DELETE /content/types/:name': (request) => {
        calls.push(request.path);
        return request.path.includes('confirm=true') ? { ok: true } : reply({ detail: 'This change deletes data.', confirmRequired: true, lost: [{ kind: 'contentType', collection: 'article', rows: 2 }] }, 409);
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Delete this type' }));
    const first = screen.getByRole('dialog', { name: 'Delete the content type Article?' });
    await userEvent.click(within(first).getByRole('button', { name: 'Delete type' }));
    const loss = await screen.findByRole('dialog', { name: 'This deletes data' });
    expect(within(loss).getByText('The content type "article" and its 2 entries')).toBeInTheDocument();
    await userEvent.click(within(loss).getByRole('button', { name: 'Delete it' }));
    await waitFor(() => {
      expect(calls).toEqual(['/content/types/article', '/content/types/article?confirm=true']);
    });
  });
});

describe('Content tab: the entry editor', () => {
  it('has a control for every field type, and creates an entry from them', async () => {
    const { seen } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Add entry' }));
    const dialog = screen.getByRole('dialog', { name: 'New Article entry' });
    await userEvent.type(within(dialog).getByLabelText('title *'), 'Hello world');
    await userEvent.type(within(dialog).getByLabelText('summary'), 'A short note');
    await userEvent.type(within(dialog).getByLabelText('body'), '# Title');
    await userEvent.type(within(dialog).getByLabelText('views'), '12');
    await userEvent.selectOptions(within(dialog).getByLabelText('featured'), 'true');
    await userEvent.type(within(dialog).getByLabelText('publishedOn'), '2026-11-17');
    await userEvent.selectOptions(within(dialog).getByLabelText('kind'), 'tip');
    await userEvent.type(within(dialog).getByLabelText('meta'), '{{"a":1}');
    await userEvent.type(within(dialog).getByLabelText('tags'), 'x{Enter}y');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Choose file…' }));
    const picker = screen.getByRole('dialog', { name: 'Choose a media file' });
    await userEvent.click(await within(picker).findByRole('button', { name: 'Use cat.png' }));
    expect(await within(dialog).findByText('cat.png')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Slug (a readable address, optional)'), 'hello-world');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }));
    await waitFor(() => {
      expect(seen).toHaveLength(1);
    });
    expect(seen[0]).toMatchObject({ method: 'POST', path: '/content/entries' });
    expect(bodyOf(seen[0])).toEqual({
      type: 'article',
      slug: 'hello-world',
      values: {
        en: { title: 'Hello world', summary: 'A short note', body: '# Title', views: 12, featured: true, publishedOn: '2026-11-17', kind: 'tip', cover: MEDIA_ID, meta: { a: 1 }, tags: ['x', 'y'] },
      },
    });
    expect(await within(dialog).findByText('Draft saved.')).toBeInTheDocument();
    // The editor stays open on the saved entry (id 9), so a next save is an update.
    expect(within(dialog).getByRole('heading', { name: 'Edit Article entry 9' })).toBeInTheDocument();
  });

  it('names a number or JSON it cannot read, and sends nothing', async () => {
    const { seen } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Add entry' }));
    const dialog = screen.getByRole('dialog', { name: 'New Article entry' });
    await userEvent.type(within(dialog).getByLabelText('views'), 'many');
    await userEvent.type(within(dialog).getByLabelText('meta'), '{{nope');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }));
    expect(await within(dialog).findByText('Must be a number.')).toBeInTheDocument();
    expect(within(dialog).getByText('Must be valid JSON.')).toBeInTheDocument();
    expect(seen).toHaveLength(0);
  });

  it('shows the engine message when it refuses a save', async () => {
    setup({ 'POST /content/entries': () => reply({ detail: 'slug: That slug is already used by another "article" entry.' }, 409) });
    await userEvent.click(await screen.findByRole('button', { name: 'Add entry' }));
    const dialog = screen.getByRole('dialog', { name: 'New Article entry' });
    await userEvent.type(within(dialog).getByLabelText('title *'), 'T');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('already used');
  });

  it('switches the language, marks a missing translation, and saves each language on its own', async () => {
    const { seen } = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Hello' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Article entry 1' });
    const english = within(dialog).getByRole('tab', { name: 'en (default)' });
    const arabic = within(dialog).getByRole('tab', { name: 'ar (missing)' });
    expect(english).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).getByLabelText('title *')).toHaveValue('Hello');
    await userEvent.click(arabic);
    expect(arabic).toHaveAttribute('aria-selected', 'true');
    // The empty Arabic title shows the English one as a hint, and holds nothing.
    expect(within(dialog).getByLabelText('title *')).toHaveValue('');
    expect(within(dialog).getByLabelText('title *')).toHaveAttribute('placeholder', 'Hello');
    await userEvent.type(within(dialog).getByLabelText('title *'), 'مرحبا');
    expect(within(dialog).getByRole('tab', { name: 'ar' })).toBeInTheDocument(); // no longer missing
    await userEvent.click(within(dialog).getByRole('tab', { name: 'en (default)' }));
    expect(within(dialog).getByLabelText('title *')).toHaveValue('Hello');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }));
    await waitFor(() => {
      expect(seen).toHaveLength(1);
    });
    expect(seen[0]).toMatchObject({ method: 'PUT', path: '/content/entries/1' });
    expect(bodyOf(seen[0])).toEqual({ slug: 'hello', values: { en: { title: 'Hello', body: 'Some **bold** text' }, ar: { title: 'مرحبا' } } });
  });

  it('removes a language that was saved and is now emptied (null), and drops a cleared field', async () => {
    const { seen } = setup({ 'GET /content/entries/:id': () => detail({ values: { en: { title: 'Hello', summary: 'S' }, ar: { title: 'مرحبا' } } }) });
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Hello' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Article entry 1' });
    await userEvent.clear(within(dialog).getByLabelText('summary'));
    await userEvent.click(within(dialog).getByRole('tab', { name: 'ar' }));
    await userEvent.clear(within(dialog).getByLabelText('title *'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save draft' }));
    await waitFor(() => {
      expect(seen).toHaveLength(1);
    });
    expect(bodyOf(seen[0]).values).toEqual({ en: { title: 'Hello' }, ar: null });
  });

  it('a type that is not localized has no language tabs', async () => {
    setup({ 'GET /content/entries': () => ({ items: [summary(5, { type: 'home', title: 'Hi', locales: ['en'] })], total: 1, skip: 0, limit: 200 }), 'GET /content/entries/:id': () => detail({ id: 5, type: 'home', values: { en: { headline: 'Hi' } } }) });
    await userEvent.click(await screen.findByRole('button', { name: /^Home/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Hi' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Home entry 5' });
    expect(within(dialog).queryByRole('tablist')).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('headline')).toHaveValue('Hi');
  });
});

describe('Content tab: publishing', () => {
  const openFirst = async () => {
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Hello' }));
    return screen.findByRole('dialog', { name: 'Edit Article entry 1' });
  };

  it('Publish saves what changed, then publishes', async () => {
    const { seen } = setup();
    const dialog = await openFirst();
    await userEvent.type(within(dialog).getByLabelText('summary'), 'More');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    await waitFor(() => {
      expect(seen.map((request) => `${request.method} ${request.path}`)).toEqual(['PUT /content/entries/1', 'POST /content/entries/1/publish']);
    });
    expect(await within(dialog).findByText(/Published\. It is now in the public API/)).toBeInTheDocument();
    expect(within(dialog).getByText('Published', { selector: '.badge' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Unpublish' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(within(dialog).getByText(/saving changes updates the public API at once/)).toBeInTheDocument();
  });

  it('Publish with nothing changed only publishes', async () => {
    const { seen } = setup();
    const dialog = await openFirst();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    await waitFor(() => {
      expect(seen.map((request) => `${request.method} ${request.path}`)).toEqual(['POST /content/entries/1/publish']);
    });
  });

  it('will not publish while a needed field is empty', async () => {
    const { seen } = setup({ 'GET /content/entries/:id': () => detail({ values: { en: { summary: 'x' } } }) });
    const dialog = await openFirst();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Fill in title (en) before publishing.');
    expect(seen).toHaveLength(0);
  });

  it('Schedule sends the chosen time as an ISO date-time', async () => {
    const { seen } = setup();
    const dialog = await openFirst();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Schedule' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Pick the date and time');
    await userEvent.type(within(dialog).getByLabelText('Publish at'), '2026-12-01T09:00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Schedule' }));
    await waitFor(() => {
      expect(seen).toHaveLength(1);
    });
    expect(seen[0]).toMatchObject({ method: 'POST', path: '/content/entries/1/schedule' });
    expect(bodyOf(seen[0]).publishAt).toBe(new Date('2026-12-01T09:00').toISOString());
    expect(await within(dialog).findByText('Scheduled', { selector: '.badge' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel schedule' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Publish now' })).toBeInTheDocument();
  });

  it('Unpublish asks first, then hides the entry', async () => {
    const { seen } = setup({ 'GET /content/entries/:id': () => detail({ status: 'published', publishAt: '2026-11-18T09:00:00.000Z' }) });
    const dialog = await openFirst();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Unpublish' }));
    const confirm = screen.getByRole('dialog', { name: 'Unpublish this entry?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(seen).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Unpublish' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Unpublish this entry?' })).getByRole('button', { name: 'Unpublish' }));
    await waitFor(() => {
      expect(seen.map((request) => `${request.method} ${request.path}`)).toEqual(['POST /content/entries/1/unpublish']);
    });
    expect(await within(dialog).findByText('Draft', { selector: '.badge' })).toBeInTheDocument();
  });

  it('lists the versions and reverts to an older one after a confirm', async () => {
    const { seen } = setup();
    const dialog = await openFirst();
    const list = await within(dialog).findByRole('region', { name: 'Versions' });
    expect(within(list).getByText(/Version 2 · saved/)).toBeInTheDocument();
    expect(within(list).getByText('current')).toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: 'Revert to version 2' })).not.toBeInTheDocument();
    await userEvent.click(within(list).getByRole('button', { name: 'Revert to version 1' }));
    const confirm = screen.getByRole('dialog', { name: 'Revert to version 1?' });
    expect(seen).toHaveLength(0);
    await userEvent.click(within(confirm).getByRole('button', { name: 'Revert' }));
    await waitFor(() => {
      expect(seen).toHaveLength(1);
    });
    expect(seen[0]).toMatchObject({ method: 'POST', path: '/content/entries/1/revert' });
    expect(bodyOf(seen[0])).toEqual({ version: 1 });
    expect(await within(dialog).findByText('Reverted to version 1.')).toBeInTheDocument();
  });

  it('deleting an entry is confirmed', async () => {
    const { seen } = setup();
    const dialog = await openFirst();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete entry' }));
    const confirm = screen.getByRole('dialog', { name: 'Delete this entry?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(seen).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete entry' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Delete this entry?' })).getByRole('button', { name: 'Delete entry' }));
    await waitFor(() => {
      expect(seen.map((request) => `${request.method} ${request.path}`)).toEqual(['DELETE /content/entries/1']);
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Edit Article entry 1' })).not.toBeInTheDocument();
    });
  });

  it('asks before closing an editor that has unsaved changes', async () => {
    setup();
    const dialog = await openFirst();
    await userEvent.type(within(dialog).getByLabelText('summary'), 'unsaved');
    expect(within(dialog).getByText('Unsaved changes')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    const confirm = screen.getByRole('dialog', { name: 'Discard your changes?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('dialog', { name: 'Edit Article entry 1' })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Discard your changes?' })).getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('Content tab: Markdown is never rendered as HTML', () => {
  const HOSTILE = ['<script>alert(1)</script>', '<img src=x onerror="alert(2)">', '<a href="javascript:alert(3)">click</a>', '[link](javascript:alert(4))', '**bold**'].join('\n\n');

  it('shows <script> and <img onerror> from the Markdown as text, with no element made from them', async () => {
    setup({ 'GET /content/entries/:id': () => detail({ values: { en: { title: 'T', body: HOSTILE } } }) });
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Hello' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Article entry 1' });
    const preview = await within(dialog).findByRole('region', { name: 'Preview of body' });
    expect(preview).toHaveTextContent('<script>alert(1)</script>');
    expect(preview).toHaveTextContent('<img src=x onerror="alert(2)">');
    expect(preview).toHaveTextContent('<a href="javascript:alert(3)">click</a>');
    expect(preview.querySelector('script, img, a, iframe, object, embed, [onerror]')).toBeNull();
    expect(document.querySelector('script:not([type="module"]), img[src="x"], a[href^="javascript"]')).toBeNull();
    // Markdown that is safe is still styled.
    expect(preview.querySelector('strong')?.textContent).toBe('bold');
    // A link keeps its words and address as plain text; it is not clickable.
    expect(preview).toHaveTextContent('link (javascript:alert(4))');
  });
});
