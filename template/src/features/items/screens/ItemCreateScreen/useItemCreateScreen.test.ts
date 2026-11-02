import { act, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';

import { setFlagOverride } from '@services/flags/flagOverrides';
import { fillFields } from '@test-utils/form';
import { server } from '@test-utils/msw/server';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useItemCreateScreen } from './useItemCreateScreen';

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

afterEach(() => {
  setFlagOverride('itemsCreateEnabled', undefined);
});

const VALID = { title: 'Desk lamp', price: '19.99', description: 'A lamp', category: 'home' };

async function submitWith(values: Record<string, string>) {
  const view = await renderHookWithProviders(() => useItemCreateScreen());
  await fillFields(view.result.current.control, values);
  await act(() => {
    view.result.current.onSubmit();
    return Promise.resolve();
  });
  return view;
}

describe('useItemCreateScreen', () => {
  test('is enabled by default and not pending', async () => {
    const { result } = await renderHookWithProviders(() => useItemCreateScreen());

    expect(result.current.isEnabled).toBe(true);
    expect(result.current.isPending).toBe(false);
  });

  test('reflects the disabled feature flag', async () => {
    setFlagOverride('itemsCreateEnabled', false);

    const { result } = await renderHookWithProviders(() => useItemCreateScreen());

    expect(result.current.isEnabled).toBe(false);
  });

  test('a valid form creates the item and goes back', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post('*/products/add', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ id: 101 }, { status: 201 });
      }),
    );

    await submitWith(VALID);

    await waitFor(() => {
      expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    });
    expect(bodies).toHaveLength(1);
  });

  test('an invalid form sends nothing and stays on the screen', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post('*/products/add', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ id: 101 }, { status: 201 });
      }),
    );

    await submitWith({ ...VALID, title: '' });

    expect(bodies).toEqual([]);
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  test('a failed create does not go back', async () => {
    server.use(
      http.post('*/products/add', () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
    );

    const { result } = await submitWith(VALID);

    await waitFor(() => {
      expect(result.current.isPending).toBe(false);
    });
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  test('onBack is the navigation goBack', async () => {
    const { result } = await renderHookWithProviders(() => useItemCreateScreen());

    result.current.onBack();

    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });
});
