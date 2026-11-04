import { act, waitFor } from '@testing-library/react-native';
import { http, HttpResponse } from 'msw';

import { setFlagOverride } from '@services/flags/flagOverrides';
import { fillFields } from '@test-utils/form';
import { server } from '@test-utils/msw/server';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { CreateItemSchema } from '../../types';

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

  test('a quantity below 1 sends nothing and stays on the screen', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post('*/products/add', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ id: 101 }, { status: 201 });
      }),
    );
    const view = await renderHookWithProviders(() => useItemCreateScreen());
    await fillFields(view.result.current.control, VALID);
    await act(async () => {
      await view.result.current.control
        .register('quantity')
        .onChange({ target: { name: 'quantity', value: 0 }, type: 'change' });
    });
    await act(() => {
      view.result.current.onSubmit();
      return Promise.resolve();
    });

    expect(bodies).toEqual([]);
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  test('offers the tag options in the current language', async () => {
    const { result } = await renderHookWithProviders(() => useItemCreateScreen());

    expect(result.current.tagOptions.map((option) => option.value)).toEqual([
      'new',
      'sale',
      'popular',
      'eco',
    ]);
    expect(result.current.tagOptions.map((option) => option.label)).toEqual([
      'New',
      'On sale',
      'Popular',
      'Eco-friendly',
    ]);
  });
});

const SCHEMA_INPUT = {
  title: 'Desk lamp',
  price: '24.5',
  description: 'Warm light',
  category: 'home',
  quantity: 1,
  tags: ['sale'],
};

const messagesFor = (input: unknown) => {
  const result = CreateItemSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe('CreateItemSchema quantity and tags', () => {
  test('accepts a quantity of at least 1 and a list of tags', () => {
    const result = CreateItemSchema.safeParse(SCHEMA_INPUT);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ quantity: 1, tags: ['sale'], price: 24.5 });
  });

  test('accepts no tags', () => {
    expect(CreateItemSchema.safeParse({ ...SCHEMA_INPUT, tags: [] }).success).toBe(true);
  });

  test.each([0, -3])('rejects a quantity of %i with the quantity message', (quantity) => {
    expect(messagesFor({ ...SCHEMA_INPUT, quantity })).toEqual(['item.quantityInvalid']);
  });

  test('rejects a quantity that is not a whole number', () => {
    expect(messagesFor({ ...SCHEMA_INPUT, quantity: 1.5 })).toEqual(['item.quantityInvalid']);
  });

  test.each([undefined, '2', Number.NaN])(
    'rejects a quantity of %p that is not a number',
    (quantity) => {
      expect(messagesFor({ ...SCHEMA_INPUT, quantity })).toEqual(['item.quantityInvalid']);
    },
  );

  test('rejects tags that are not a list of strings', () => {
    expect(CreateItemSchema.safeParse({ ...SCHEMA_INPUT, tags: 'sale' }).success).toBe(false);
    expect(CreateItemSchema.safeParse({ ...SCHEMA_INPUT, tags: [1] }).success).toBe(false);
  });
});
