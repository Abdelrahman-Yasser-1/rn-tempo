import { screen, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';

import { setFlagOverride } from '@services/flags/flagOverrides';
import { toast } from '@services/toast/toast';
import { server } from '@test-utils/msw/server';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { itemKeys } from '../../api/keys';

import { ItemCreateScreen } from './ItemCreateScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), reset: jest.fn() };
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<Record<string, unknown>>('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

beforeEach(() => {
  mockNavigation.navigate.mockClear();
  mockNavigation.goBack.mockClear();
  mockNavigation.reset.mockClear();
});

async function renderCreate() {
  return renderWithProviders(<ItemCreateScreen />);
}

/** Records the body of every POST /products/add. */
function recordCreates() {
  const bodies: unknown[] = [];
  server.use(
    http.post('*/products/add', async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ id: 101 }, { status: 201 });
    }),
  );
  return bodies;
}

describe('ItemCreateScreen', () => {
  let toastSpy: jest.SpyInstance;

  beforeEach(() => {
    // The toast is not under test here; the spy only records calls.
    toastSpy = jest.spyOn(toast, 'show').mockImplementation(() => {
      // Intentionally empty.
    });
  });

  afterEach(() => {
    toastSpy.mockRestore();
    setFlagOverride('itemsCreateEnabled', undefined);
  });

  test('AC-5: a valid form creates the item, invalidates the list and goes back', async () => {
    const bodies = recordCreates();
    const { user, queryClient } = await renderCreate();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await user.type(screen.getByLabelText('Title'), 'Desk lamp');
    await user.type(screen.getByLabelText('Price (USD)'), '24.5');
    await user.type(screen.getByLabelText('Description'), 'Warm light for late work');
    await user.type(screen.getByLabelText('Category'), 'home');
    await user.press(screen.getByRole('button', { name: 'Create item' }));

    await waitFor(() => {
      expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    });
    expect(bodies).toEqual([
      {
        title: 'Desk lamp',
        price: 24.5,
        description: 'Warm light for late work',
        category: 'home',
      },
    ]);
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', title: 'Item created' }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: itemKeys.lists() });
  });

  test('an incomplete form shows the field errors and sends no request', async () => {
    const bodies = recordCreates();
    const { user } = await renderCreate();

    await user.type(screen.getByLabelText('Price (USD)'), '0');
    await user.press(screen.getByRole('button', { name: 'Create item' }));

    expect(await screen.findByText('Enter a title.')).toBeOnTheScreen();
    expect(screen.getByText('Enter a price greater than 0.')).toBeOnTheScreen();
    expect(screen.getByText('Enter a description.')).toBeOnTheScreen();
    expect(screen.getByText('Enter a category.')).toBeOnTheScreen();
    expect(bodies).toEqual([]);
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  test('AC-6: with itemsCreateEnabled off, shows the unavailable state and no form', async () => {
    setFlagOverride('itemsCreateEnabled', false);

    await renderCreate();

    expect(screen.getByText('Creating items is not available right now.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Title')).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Create item' })).not.toBeOnTheScreen();
  });
});
