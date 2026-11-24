import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { WhatsNewEntry } from './WhatsNewEntry';

const mockNavigation = { navigate: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<Record<string, unknown>>('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

beforeEach(() => {
  mockNavigation.navigate.mockClear();
});

describe('WhatsNewEntry', () => {
  it("AC-C-3: is a button that opens What's new", async () => {
    const { user } = await renderWithProviders(<WhatsNewEntry />);

    await user.press(screen.getByRole('button', { name: "What's new" }));

    expect(mockNavigation.navigate).toHaveBeenCalledWith('WhatsNew');
  });

  it('shows the hint in the app language', async () => {
    await renderWithProviders(<WhatsNewEntry />, { language: 'es' });

    expect(screen.getByRole('button', { name: 'Novedades' })).toBeOnTheScreen();
    expect(screen.getByText('Consulta los últimos anuncios.')).toBeOnTheScreen();
  });
});
