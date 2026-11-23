import { waitFor } from '@testing-library/react-native';

import { appIconService } from '@services/app-icon';
import { toast } from '@services/toast/toast';
import { actAsync } from '@test-utils/act';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useCurrentAppIcon } from './useCurrentAppIcon';

let mockFocus: () => void;
jest.mock('@shared/hooks/useOnFocus', () => ({
  useOnFocus: (callback: () => void) => {
    mockFocus = callback;
  },
}));

afterEach(() => {
  jest.restoreAllMocks();
});

it('AC-I-2: reads the native icon on each focus', async () => {
  const read = jest.spyOn(appIconService, 'getIcon').mockResolvedValue('forest');
  const { result } = await renderHookWithProviders(useCurrentAppIcon);
  await actAsync(mockFocus);
  await waitFor(() => {
    expect(result.current.value).toBe('forest');
  });
  read.mockResolvedValue('sunset');
  await actAsync(mockFocus);
  await waitFor(() => {
    expect(result.current.value).toBe('sunset');
  });
});

it('shows a translated toast when the system selection cannot be read', async () => {
  jest.spyOn(appIconService, 'getIcon').mockRejectedValue(new Error('read failed'));
  const error = jest.spyOn(toast, 'error').mockImplementation(jest.fn());
  await renderHookWithProviders(useCurrentAppIcon);
  await actAsync(mockFocus);
  expect(error).toHaveBeenCalledWith('Couldn’t read the current icon.');
});
