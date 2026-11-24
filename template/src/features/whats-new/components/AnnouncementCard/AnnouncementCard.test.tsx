import { screen } from '@testing-library/react-native';

import type { CmsEntry } from '@services/cms';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { AnnouncementCard } from './AnnouncementCard';

function entry(fields: Partial<CmsEntry['fields']> = {}): CmsEntry {
  return {
    id: 1,
    slug: 'news',
    type: 'announcement',
    locale: 'en',
    availableLocales: ['en'],
    fallbackFields: [],
    fields: {
      title: 'Big news',
      body: undefined,
      image: undefined,
      ctaLabel: undefined,
      ctaUrl: undefined,
      ...fields,
    },
    updatedAt: '2026-01-01T00:00:00.000Z',
    publishedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('AnnouncementCard', () => {
  it('shows the title as a heading and the Markdown body', async () => {
    await renderWithProviders(
      <AnnouncementCard entry={entry({ body: 'Some **bold** words' })} onCtaPress={jest.fn()} />,
    );
    expect(screen.getByRole('header', { name: 'Big news' })).toBeOnTheScreen();
    expect(screen.getByText('Some bold words')).toBeOnTheScreen();
  });

  it('has no body or button when the entry has neither', async () => {
    await renderWithProviders(<AnnouncementCard entry={entry()} onCtaPress={jest.fn()} />);
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('opens the call-to-action link', async () => {
    const onCtaPress = jest.fn();
    const { user } = await renderWithProviders(
      <AnnouncementCard
        entry={entry({ ctaLabel: 'Learn more', ctaUrl: 'https://example.test/more' })}
        onCtaPress={onCtaPress}
      />,
    );
    await user.press(screen.getByRole('button', { name: 'Learn more' }));
    expect(onCtaPress).toHaveBeenCalledWith('https://example.test/more');
  });

  it.each([
    ['no url', { ctaLabel: 'Learn more' }],
    ['no label', { ctaUrl: 'https://example.test/more' }],
    ['an empty label', { ctaLabel: '', ctaUrl: 'https://example.test/more' }],
    ['a javascript: url', { ctaLabel: 'Learn more', ctaUrl: 'javascript:alert(1)' }],
    ['a relative url', { ctaLabel: 'Learn more', ctaUrl: '/more' }],
  ])('shows no button with %s', async (_name, fields) => {
    await renderWithProviders(<AnnouncementCard entry={entry(fields)} onCtaPress={jest.fn()} />);
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('shows the image with its alt text', async () => {
    await renderWithProviders(
      <AnnouncementCard
        entry={entry({ image: { url: 'https://example.test/a.png', alt: 'A sunrise' } })}
        onCtaPress={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('A sunrise')).toBeOnTheScreen();
  });
});
