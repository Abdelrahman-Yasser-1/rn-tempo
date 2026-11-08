// @tempo-feature:file-picker:start
import { BottomSheetModal } from '@gorhom/bottom-sheet';
// @tempo-feature:file-picker:end
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
// @tempo-feature:maps:start
import { act } from '@testing-library/react-native';
// @tempo-feature:maps:end
import { http, HttpResponse } from 'msw';

// @tempo-feature:file-picker:start
import { itemKeys } from '@features/items/api/keys';
import { pickDocument } from '@services/files/files';
// @tempo-feature:file-picker:end
import { setFlagOverride } from '@services/flags/flagOverrides';
import { toast } from '@services/toast/toast';
import { addDays, formatFullDate, toISODate } from '@shared/utils/calendar';
import { server } from '@test-utils/msw/server';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ItemCreateScreen } from './ItemCreateScreen';

// @tempo-feature:file-picker:start
jest.mock('@services/files/files');
// @tempo-feature:file-picker:end

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

/** Fills the required fields of the form. */
async function fillRequired(user: Awaited<ReturnType<typeof renderCreate>>['user']) {
  await user.type(screen.getByLabelText('Title'), 'Desk lamp');
  await user.type(screen.getByLabelText('Price (USD)'), '24.5');
  await user.type(screen.getByLabelText('Description'), 'Warm light');
  await user.type(screen.getByLabelText('Category'), 'home');
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
        quantity: 1,
        tags: [],
      },
    ]);
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', title: 'Item created' }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: itemKeys.lists() });
  });

  test('the quantity stepper and the tag sheet feed the created item', async () => {
    const bodies = recordCreates();
    const { user } = await renderCreate();

    await user.type(screen.getByLabelText('Title'), 'Desk lamp');
    await user.type(screen.getByLabelText('Price (USD)'), '24.5');
    await user.type(screen.getByLabelText('Description'), 'Warm light');
    await user.type(screen.getByLabelText('Category'), 'home');
    await user.press(screen.getByRole('button', { name: 'Increase' }));
    await user.press(screen.getByRole('checkbox', { name: 'On sale' }));
    await user.press(screen.getByRole('button', { name: 'Create item' }));

    await waitFor(() => {
      expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    });
    expect(bodies).toEqual([expect.objectContaining({ quantity: 2, tags: ['sale'] })]);
  });

  test('the quantity cannot go below 1: the decrease button is disabled and typing 0 is raised to 1', async () => {
    const bodies = recordCreates();
    const { user } = await renderCreate();

    expect(screen.getByRole('button', { name: 'Decrease' })).toBeDisabled();
    await user.type(screen.getByLabelText('Title'), 'Desk lamp');
    await user.type(screen.getByLabelText('Price (USD)'), '24.5');
    await user.type(screen.getByLabelText('Description'), 'Warm light');
    await user.type(screen.getByLabelText('Category'), 'home');
    const quantity = screen.getByRole('adjustable', { name: 'Quantity' });
    /* eslint-disable testing-library/no-await-sync-events -- RNTL 14 fireEvent is async */
    await fireEvent(quantity, 'focus');
    await fireEvent.changeText(quantity, '0');
    await fireEvent(quantity, 'blur');
    /* eslint-enable testing-library/no-await-sync-events -- end of the block disabled above */
    await user.press(screen.getByRole('button', { name: 'Create item' }));

    await waitFor(() => {
      expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('Enter a quantity of at least 1.')).not.toBeOnTheScreen();
    expect(bodies).toEqual([expect.objectContaining({ quantity: 1 })]);
  });

  test('the quantity and every chosen tag reach the request, in the order they were picked', async () => {
    const bodies = recordCreates();
    const { user } = await renderCreate();

    await user.type(screen.getByLabelText('Title'), 'Desk lamp');
    await user.type(screen.getByLabelText('Price (USD)'), '24.5');
    await user.type(screen.getByLabelText('Description'), 'Warm light');
    await user.type(screen.getByLabelText('Category'), 'home');
    await user.press(screen.getByRole('button', { name: 'Increase' }));
    await user.press(screen.getByRole('button', { name: 'Increase' }));
    await user.press(screen.getByRole('checkbox', { name: 'Eco-friendly' }));
    await user.press(screen.getByRole('checkbox', { name: 'New' }));
    await user.press(screen.getByRole('button', { name: 'Create item' }));

    await waitFor(() => {
      expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    });
    expect(bodies).toEqual([expect.objectContaining({ quantity: 3, tags: ['eco', 'new'] })]);
  });

  test('the availability day and the pickup slot are sent only when chosen', async () => {
    const bodies = recordCreates();
    const { user } = await renderCreate();
    const tomorrow = addDays(toISODate(new Date()), 1);

    await user.type(screen.getByLabelText('Title'), 'Desk lamp');
    await user.type(screen.getByLabelText('Price (USD)'), '24.5');
    await user.type(screen.getByLabelText('Description'), 'Warm light');
    await user.type(screen.getByLabelText('Category'), 'home');
    await user.press(screen.getByRole('button', { name: /^Available from/ }));
    await user.press(screen.getByRole('button', { name: formatFullDate(tomorrow, 'en') }));
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    await user.press(screen.getByRole('button', { name: /^Pickup slot/ }));
    await user.press(screen.getByRole('button', { name: /^2:00/ }));
    await user.press(screen.getByRole('button', { name: 'Create item' }));

    await waitFor(() => {
      expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    });
    expect(bodies).toEqual([
      expect.objectContaining({ availableFrom: tomorrow, pickupSlot: '14:00' }),
    ]);
  });

  test('only the availability day is sent when no pickup slot is chosen', async () => {
    const bodies = recordCreates();
    const { user } = await renderCreate();
    const today = toISODate(new Date());

    await fillRequired(user);
    await user.press(screen.getByRole('button', { name: /^Available from/ }));
    await user.press(screen.getByRole('button', { name: formatFullDate(today, 'en') }));
    await user.press(screen.getByRole('button', { name: 'Confirm' }));
    await user.press(screen.getByRole('button', { name: 'Create item' }));

    await waitFor(() => {
      expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    });
    expect(bodies).toEqual([expect.objectContaining({ availableFrom: today })]);
    expect(bodies[0]).not.toHaveProperty('pickupSlot');
  });

  test('only the pickup slot is sent when no availability day is chosen', async () => {
    const bodies = recordCreates();
    const { user } = await renderCreate();

    await fillRequired(user);
    await user.press(screen.getByRole('button', { name: /^Pickup slot/ }));
    await user.press(screen.getByRole('button', { name: /^6:30/ }));
    await user.press(screen.getByRole('button', { name: 'Create item' }));

    await waitFor(() => {
      expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    });
    expect(bodies).toEqual([expect.objectContaining({ pickupSlot: '18:30' })]);
    expect(bodies[0]).not.toHaveProperty('availableFrom');
  });

  test('the availability day cannot be earlier than today', async () => {
    const { user } = await renderCreate();
    const today = toISODate(new Date());
    const yesterday = addDays(today, -1);

    await user.press(screen.getByRole('button', { name: /^Available from/ }));

    expect(screen.getByRole('button', { name: formatFullDate(today, 'en') })).toBeEnabled();
    // Yesterday only shows when it belongs to the grid (not on the first of a Sunday month).
    for (const cell of screen.queryAllByRole('button', { name: formatFullDate(yesterday, 'en') })) {
      expect(cell).toBeDisabled();
    }
    // Nothing earlier can be reached by paging back either.
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
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

  // @tempo-feature:file-picker:start
  test('the chosen attachment is sent in the request body', async () => {
    jest.spyOn(BottomSheetModal.prototype, 'dismiss').mockImplementation(function dismiss(this: {
      props: { onDismiss?: () => void };
    }) {
      this.props.onDismiss?.();
    });
    const attachment = {
      uri: 'file:///manual.pdf',
      name: 'manual.pdf',
      type: 'application/pdf',
      size: 2048,
    };
    jest.mocked(pickDocument).mockResolvedValue([attachment]);
    const bodies = recordCreates();
    const { user } = await renderCreate();

    await fillRequired(user);
    await user.press(screen.getByRole('button', { name: 'Attachment' }));
    await user.press(screen.getByText('Browse files'));
    expect(await screen.findByText('manual.pdf')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Create item' }));

    await waitFor(() => {
      expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    });
    expect(bodies).toEqual([expect.objectContaining({ attachment })]);
    jest.restoreAllMocks();
  });

  test('the attachment is left out of the request when it was removed again', async () => {
    jest.spyOn(BottomSheetModal.prototype, 'dismiss').mockImplementation(function dismiss(this: {
      props: { onDismiss?: () => void };
    }) {
      this.props.onDismiss?.();
    });
    jest
      .mocked(pickDocument)
      .mockResolvedValue([
        { uri: 'file:///manual.pdf', name: 'manual.pdf', type: 'application/pdf', size: 2048 },
      ]);
    const bodies = recordCreates();
    const { user } = await renderCreate();

    await fillRequired(user);
    await user.press(screen.getByRole('button', { name: 'Attachment' }));
    await user.press(screen.getByText('Browse files'));
    await user.press(await screen.findByRole('button', { name: 'Remove manual.pdf' }));
    await user.press(screen.getByRole('button', { name: 'Create item' }));

    await waitFor(() => {
      expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    });
    expect(bodies[0]).not.toHaveProperty('attachment');
    jest.restoreAllMocks();
  });
  // @tempo-feature:file-picker:end

  // @tempo-feature:maps:start
  test('the chosen pickup location is sent in the request body', async () => {
    const bodies = recordCreates();
    const { user } = await renderCreate();

    await fillRequired(user);
    await user.press(screen.getByRole('button', { name: 'Pickup location' }));
    await act(() => {
      (
        screen.getByLabelText('Map').props as {
          onRegionChangeComplete: (region: object) => void;
        }
      ).onRegionChangeComplete({ latitude: 21.5433, longitude: 39.1728 });
    });
    // The date and slot sheets have a Confirm button too; the map sheet is mounted last.
    const mapConfirm = screen.getAllByRole('button', { name: 'Confirm' }).at(-1);
    if (mapConfirm === undefined) {
      throw new Error('The map sheet has no Confirm button');
    }
    await user.press(mapConfirm);
    await user.press(screen.getByRole('button', { name: 'Create item' }));

    await waitFor(() => {
      expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    });
    expect(bodies).toEqual([
      expect.objectContaining({ pickupLocation: { latitude: 21.5433, longitude: 39.1728 } }),
    ]);
    jest.restoreAllMocks();
  });
  // @tempo-feature:maps:end
});
