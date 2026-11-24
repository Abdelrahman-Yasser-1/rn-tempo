import { act, waitFor } from '@testing-library/react-native';

import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { getCmsClient } from './client';
import { useCmsEntries, useCmsEntry } from './queries';

afterEach(() => jest.restoreAllMocks());

test('AC-C-1: pages in the active language with the cursor supplied by the provider', async () => {
  const fetch = jest
    .spyOn(getCmsClient(), 'getEntries')
    .mockResolvedValueOnce({ items: [], nextCursor: 'opaque' })
    .mockResolvedValueOnce({ items: [], nextCursor: null });
  const { result } = await renderHookWithProviders(
    () => useCmsEntries('announcement', { limit: 4 }),
    { language: 'de' },
  );
  await waitFor(() => {
    expect(result.current.hasNextPage).toBe(true);
  });
  await act(async () => {
    await result.current.fetchNextPage();
  });
  await waitFor(() => {
    expect(result.current.hasNextPage).toBe(false);
  });
  expect(fetch.mock.calls).toEqual([
    ['announcement', { limit: 4, locale: 'de', cursor: undefined }],
    ['announcement', { limit: 4, locale: 'de', cursor: 'opaque' }],
  ]);
});

test('AC-C-1: requests a single entry by slug in the active language', async () => {
  const error = new Error('read failed');
  const fetch = jest.spyOn(getCmsClient(), 'getEntry').mockRejectedValue(error);
  const { result } = await renderHookWithProviders(() => useCmsEntry('announcement', 'news'), {
    language: 'fr',
  });
  await waitFor(() => {
    expect(result.current.error).toBe(error);
  });
  expect(fetch).toHaveBeenCalledWith('announcement', 'news', { locale: 'fr' });
});
