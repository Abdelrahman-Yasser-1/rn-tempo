import { renderHook } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';

import { logger } from '@services/logger/logger';

import { submitForm } from './submit';

describe('submitForm', () => {
  it('calls onValid with the values', async () => {
    const onValid = jest.fn<undefined, [{ a: string }]>();
    const { result } = await renderHook(() => useForm({ defaultValues: { a: 'x' } }));
    submitForm(result.current, onValid);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(onValid).toHaveBeenCalledTimes(1);
    expect(onValid.mock.calls[0]?.[0]).toEqual({ a: 'x' });
  });

  it('logs what onSubmit throws instead of leaving an unhandled rejection', async () => {
    const error = jest.spyOn(logger, 'error').mockReturnValue(undefined);
    const { result } = await renderHook(() => useForm({ defaultValues: { a: 'x' } }));
    submitForm(result.current, () => {
      throw new Error('server down');
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(error).toHaveBeenCalledWith('dynamic-forms: onSubmit threw', expect.any(Error));
    error.mockRestore();
  });
});
