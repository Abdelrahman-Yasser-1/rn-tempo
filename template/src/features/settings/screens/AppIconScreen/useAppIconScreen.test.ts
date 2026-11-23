import { waitFor } from '@testing-library/react-native';

import { appIconService } from '@services/app-icon';
import { toast } from '@services/toast/toast';
import { actAsync } from '@test-utils/act';
import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useAppIconScreen } from './useAppIconScreen';

afterEach(() => {
  jest.restoreAllMocks();
});

it('AC-I-1: ignores repeated and unknown selections and reports a failed switch', async () => {
  jest.spyOn(appIconService, 'getIcon').mockResolvedValue('forest');
  const write = jest.spyOn(appIconService, 'setIcon').mockRejectedValue(new Error('change failed'));
  const error = jest.spyOn(toast, 'error').mockImplementation(jest.fn());
  const { result } = await renderHookWithProviders(useAppIconScreen);
  await waitFor(() => {
    expect(result.current.value).toBe('forest');
  });
  await actAsync(() => {
    result.current.onChange('forest');
    result.current.onChange('unknown');
    result.current.onChange('ocean');
    result.current.onChange('sunset');
  });
  expect(write).toHaveBeenCalledTimes(1);
  expect(write).toHaveBeenCalledWith('ocean');
  expect(error).toHaveBeenCalledWith('Couldn’t change the app icon.');
  expect(result.current.disabled).toBe(false);
  expect(result.current.value).toBe('forest');
});
