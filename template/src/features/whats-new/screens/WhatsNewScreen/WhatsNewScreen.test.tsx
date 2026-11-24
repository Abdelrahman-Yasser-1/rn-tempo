import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';

import { ENV } from '@config/env';
import { openUrlSafe } from '@services/linking/linking';
import { useNetworkStore } from '@services/network/network';
import { server } from '@test-utils/msw/server';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { WhatsNewScreen } from './WhatsNewScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<Record<string, unknown>>('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));
jest.mock('@services/linking/linking', () => ({
  openUrlSafe: jest.fn(() => Promise.resolve(true)),
}));

const LIST_URL = `${ENV.API_BASE_URL}/content/announcement`;

/** A backend document in the shape the adapter validates. */
function document(id: number, fields: Record<string, unknown>) {
  return {
    id,
    slug: `entry-${String(id)}`,
    type: 'announcement',
    locale: 'en',
    availableLocales: ['en'],
    fallbackFields: [],
    fields,
    updatedAt: '2026-01-01T00:00:00.000Z',
    publishedAt: '2026-01-01T00:00:00.000Z',
  };
}

/** Every request the list makes to the content API, as its query string. */
const requested: string[] = [];

beforeEach(() => {
  useNetworkStore.setState({ isConnected: true, isInternetReachable: true });
  mockNavigation.goBack.mockClear();
  jest.mocked(openUrlSafe).mockClear();
  requested.length = 0;
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname === '/content/announcement') {
      requested.push(url.searchParams.toString());
    }
  });
});

afterEach(() => {
  server.events.removeAllListeners();
});

/** Lets query-core's batched notifications run inside act, so no update lands after the test. */
async function settle() {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

describe('WhatsNewScreen', () => {
  it('AC-C-3: lists the seeded announcements in English with their Markdown body', async () => {
    await renderWithProviders(<WhatsNewScreen />);

    expect(await screen.findByRole('header', { name: 'Welcome to Tempo' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Release notes' })).toBeOnTheScreen();
    expect(screen.getByText('local announcement')).toBeOnTheScreen();
    expect(screen.getByText('Edit it in the Content tab')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: "What's new" })).toBeOnTheScreen();
    expect(requested[0]).toContain('locale=en');
  });

  it('AC-C-3: lists the announcements in Arabic', async () => {
    await renderWithProviders(<WhatsNewScreen />, { language: 'ar' });

    expect(await screen.findByRole('header', { name: 'مرحبًا بك في Tempo' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'ما الجديد' })).toBeOnTheScreen();
    expect(screen.getByText('اعرف المزيد')).toBeOnTheScreen();
    expect(requested[0]).toContain('locale=ar');
  });

  it('AC-C-3: shows the English body where the language has none', async () => {
    await renderWithProviders(<WhatsNewScreen />, { language: 'es' });

    expect(await screen.findByRole('header', { name: 'Consejos para empezar' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Quick tips' })).toBeOnTheScreen();
    expect(screen.getByText(/pick a theme and a language/)).toBeOnTheScreen();
  });

  it('opens the call-to-action link through the link service', async () => {
    const { user } = await renderWithProviders(<WhatsNewScreen />);

    await user.press(await screen.findByRole('button', { name: 'Learn more' }));

    expect(openUrlSafe).toHaveBeenCalledWith('https://example.com/whats-new');
  });

  it('opens a link inside a body through the link service', async () => {
    server.use(
      http.get(LIST_URL, () =>
        HttpResponse.json({
          items: [document(1, { title: 'Docs', body: 'See the [guide](https://example.test/g).' })],
          nextCursor: null,
        }),
      ),
    );
    const { user } = await renderWithProviders(<WhatsNewScreen />);

    await user.press(await screen.findByRole('link', { name: 'guide' }));

    expect(openUrlSafe).toHaveBeenCalledWith('https://example.test/g');
  });

  it('shows the image of an announcement', async () => {
    server.use(
      http.get(LIST_URL, () =>
        HttpResponse.json({
          items: [
            document(1, {
              title: 'Pictured',
              image: { url: 'https://example.test/a.png', alt: 'A sunrise' },
            }),
          ],
          nextCursor: null,
        }),
      ),
    );
    await renderWithProviders(<WhatsNewScreen />);

    expect(await screen.findByLabelText('A sunrise')).toBeOnTheScreen();
  });

  it('shows the loading placeholder until the first page arrives', async () => {
    const { promise: gate, resolve: release } = Promise.withResolvers<undefined>();
    server.use(
      http.get(LIST_URL, async () => {
        await gate;
      }),
    );
    await renderWithProviders(<WhatsNewScreen />);

    /* eslint-disable rn-tempo/discouraged-syntax -- the shimmer is decorative and has no role */
    expect(
      screen.getByTestId('whats-new.loading', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    /* eslint-enable rn-tempo/discouraged-syntax -- end of the block disabled above */

    release(undefined);
    expect(await screen.findByRole('header', { name: 'Welcome to Tempo' })).toBeOnTheScreen();
  });

  it('AC-C-3: shows the empty state when there is nothing published', async () => {
    server.use(http.get(LIST_URL, () => HttpResponse.json({ items: [], nextCursor: null })));
    await renderWithProviders(<WhatsNewScreen />);

    expect(await screen.findByText('Nothing new yet')).toBeOnTheScreen();
    expect(screen.getByText('Check back later for news.')).toBeOnTheScreen();
  });

  it('AC-C-3: shows an error state and retries', async () => {
    server.use(
      http.get(LIST_URL, () => HttpResponse.json({ message: 'down' }, { status: 500 }), {
        once: true,
      }),
    );
    const { user } = await renderWithProviders(<WhatsNewScreen />);

    expect(await screen.findByText('Something went wrong')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('header', { name: 'Welcome to Tempo' })).toBeOnTheScreen();
  });

  it('AC-C-7: pull to refresh shows an entry published since the first load', async () => {
    let isPublished = false;
    server.use(
      http.get(LIST_URL, () =>
        HttpResponse.json({
          items: isPublished
            ? [document(2, { title: 'Fresh news' }), document(1, { title: 'Old news' })]
            : [document(1, { title: 'Old news' })],
          nextCursor: null,
        }),
      ),
    );
    await renderWithProviders(<WhatsNewScreen />);
    await screen.findByText('Old news');
    expect(screen.queryByText('Fresh news')).not.toBeOnTheScreen();

    isPublished = true;
    await fireEvent(screen.getByRole('header', { name: 'Old news' }), 'refresh');

    expect(await screen.findByText('Fresh news')).toBeOnTheScreen();
    await settle();
    expect(requested).toHaveLength(2);
  });

  it('loads the next page at the end of the list', async () => {
    server.use(
      http.get(LIST_URL, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        return HttpResponse.json(
          cursor === null
            ? { items: [document(1, { title: 'First page' })], nextCursor: '1' }
            : { items: [document(2, { title: 'Second page' })], nextCursor: null },
        );
      }),
    );
    await renderWithProviders(<WhatsNewScreen />);
    await screen.findByText('First page');

    await fireEvent(screen.getByRole('header', { name: 'First page' }), 'endReached');

    expect(await screen.findByText('Second page')).toBeOnTheScreen();
    await settle();
    expect(requested).toHaveLength(2);
    expect(requested[1]).toContain('cursor=1');
  });

  it('goes back from the header', async () => {
    const { user } = await renderWithProviders(<WhatsNewScreen />);
    await screen.findByText('Release notes');

    await user.press(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => {
      expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    });
  });
});
