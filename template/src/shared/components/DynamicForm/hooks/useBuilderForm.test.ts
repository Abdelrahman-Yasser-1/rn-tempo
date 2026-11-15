import { act, renderHook } from '@testing-library/react-native';
import { z } from 'zod';

import { logger } from '@services/logger/logger';
import type { FormField } from '@shared/components/DynamicForm/types';

import { useBuilderForm } from './useBuilderForm';

type Values = { name: string; age: number };

const fields: FormField<Values>[] = [
  { type: 'text', name: 'name' },
  { type: 'number', name: 'age' },
];
const schema = z.object({ name: z.string(), age: z.number().optional() }) as z.ZodType<
  Values,
  Record<string, unknown>
>;

function setup(onSubmit: (values: Values) => void | Promise<void>, hidden: string[] = []) {
  return renderHook(() =>
    useBuilderForm<Values>({
      props: { schema, onSubmit, defaultValues: { name: 'Ada' } },
      fields,
      getHiddenNames: () => hidden,
    }),
  );
}

describe('useBuilderForm', () => {
  it('starts from the empty value of each field type with the defaults on top', async () => {
    const { result } = await setup(jest.fn());

    expect(result.current.initialValues).toEqual({ name: 'Ada' });
    expect(result.current.form.getValues('name')).toBe('Ada');
    expect(result.current.context.spacing).toBe('lg');
    expect(result.current.restoredStep).toBeUndefined();
  });

  it('submits the valid values through submitWith', async () => {
    const onSubmit = jest.fn<undefined, [Values]>();
    const { result } = await setup(onSubmit);

    await act(async () => {
      result.current.submitWith(onSubmit);
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ name: 'Ada' });
  });

  it('logs what onSubmit throws instead of leaving an unhandled rejection', async () => {
    const error = jest.spyOn(logger, 'error').mockReturnValue(undefined);
    const { result } = await setup(jest.fn());

    await act(async () => {
      result.current.submitWith(() => {
        throw new Error('server down');
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });

    expect(error).toHaveBeenCalledWith('dynamic-forms: onSubmit threw', expect.any(Error));
    error.mockRestore();
  });
});
