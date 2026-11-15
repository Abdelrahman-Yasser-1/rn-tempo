import { renderHook } from '@testing-library/react-native';
import { createElement } from 'react';
import type { ReactNode } from 'react';

import { FormBuilderContext, useFormBuilderContext } from './useFormBuilderContext';
import type { FormBuilderContextValue } from './useFormBuilderContext';

describe('useFormBuilderContext', () => {
  it('returns what the builder shares', async () => {
    const value: FormBuilderContextValue = {
      resets: new Map<string, unknown>(),
      asyncErrors: new Map<string, string>(),
      spacing: 'sm',
    };
    const { result } = await renderHook(() => useFormBuilderContext(), {
      wrapper: ({ children }: Readonly<{ children: ReactNode }>) =>
        createElement(FormBuilderContext, { value }, children),
    });

    expect(result.current).toBe(value);
  });

  it('throws outside a builder, with a message that names the fix', async () => {
    const error = jest.spyOn(console, 'error').mockReturnValue(undefined);

    await expect(renderHook(() => useFormBuilderContext())).rejects.toThrow(
      'Form fields must render inside a FormBuilder or MultiStepFormBuilder',
    );

    error.mockRestore();
  });
});
