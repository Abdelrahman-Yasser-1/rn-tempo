import { waitFor } from '@testing-library/react-native';

import { openUrlSafe } from '@services/linking/linking';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useWhatsNewScreen } from './useWhatsNewScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<Record<string, unknown>>('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));
jest.mock('@services/linking/linking', () => ({
  openUrlSafe: jest.fn(() => Promise.resolve(true)),
}));

beforeEach(() => {
  mockNavigation.goBack.mockClear();
  jest.mocked(openUrlSafe).mockClear();
});

describe('useWhatsNewScreen', () => {
  it('AC-C-3: loads the announcements in the app language', async () => {
    const { result } = await renderHookWithProviders(() => useWhatsNewScreen(), {
      language: 'fr',
    });

    await waitFor(() => {
      expect(result.current.announcementsQuery.isSuccess).toBe(true);
    });
    const [first] = result.current.announcementsQuery.data?.pages ?? [];
    expect(first?.items.find((entry) => entry.slug === 'welcome')?.fields.title).toBe(
      'Bienvenue dans Tempo',
    );
  });

  it('goes back', async () => {
    const { result } = await renderHookWithProviders(() => useWhatsNewScreen());

    result.current.onBack();

    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('opens a link through the link service', async () => {
    const { result } = await renderHookWithProviders(() => useWhatsNewScreen());

    result.current.onOpenLink('https://example.test/x');

    expect(openUrlSafe).toHaveBeenCalledWith('https://example.test/x');
  });
});
