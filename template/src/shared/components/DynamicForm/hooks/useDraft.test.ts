import { act, renderHook } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';

import { initStorage } from '@services/storage/storage';
import { discardDraft, hasDraft, loadDraft } from '@shared/components/DynamicForm/drafts/drafts';
import { createDraftAuth } from '@shared/components/DynamicForm/drafts/testAuthSource';
import type { FormField } from '@shared/components/DynamicForm/types';

import { useDraft } from './useDraft';

type Values = { name: string; password: string };

const fields: FormField<Values>[] = [
  { type: 'text', name: 'name' },
  { type: 'text', name: 'password', props: { secureTextEntry: true } },
];
const KEY = 'hook-test';

const auth = createDraftAuth();

function setup(step?: number) {
  return renderHook(
    ({ current }: { current?: number }) => {
      const form = useForm<Values>({ defaultValues: { name: '', password: '' } });
      const draft = useDraft<Values>({
        draft: { key: KEY, debounceMs: 20 },
        fields,
        form,
        step: current,
      });
      return { form, ...draft };
    },
    { initialProps: { current: step } },
  );
}

describe('useDraft', () => {
  let stopCleanup: () => void;

  beforeAll(async () => {
    await initStorage();
  });

  beforeEach(() => {
    stopCleanup = auth.connect();
    auth.signIn(3);
    discardDraft(KEY);
  });

  afterEach(() => {
    auth.signOut();
    stopCleanup();
  });

  it('saves a single-page form a pause after the last change, without sensitive fields', async () => {
    const { result } = await setup();

    await act(async () => {
      result.current.form.setValue('name', 'Sam');
      result.current.form.setValue('password', 'hunter2');
      await new Promise((resolve) => {
        setTimeout(resolve, 60);
      });
    });

    expect(loadDraft(KEY)?.values).toEqual({ name: 'Sam' });
  });

  it('saves a wizard when the step changes', async () => {
    const { result, rerender } = await setup(0);
    await act(async () => {
      result.current.form.setValue('name', 'Sam');
      await Promise.resolve();
    });

    await rerender({ current: 1 });

    expect(loadDraft(KEY)).toMatchObject({ step: 1, values: { name: 'Sam' } });
  });

  it('clears the draft after a successful submit and on discard', async () => {
    const { result } = await setup();
    await act(async () => {
      result.current.form.setValue('name', 'Sam');
      await new Promise((resolve) => {
        setTimeout(resolve, 60);
      });
    });
    expect(hasDraft(KEY)).toBe(true);

    const onSubmit = jest.fn();
    await act(async () => {
      await result.current.wrapSubmit(onSubmit)({ name: 'Sam', password: '' });
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(hasDraft(KEY)).toBe(false);

    await act(async () => {
      result.current.form.setValue('name', 'Alex');
      await new Promise((resolve) => {
        setTimeout(resolve, 60);
      });
    });
    expect(hasDraft(KEY)).toBe(true);
    await act(() => {
      result.current.discard();
    });
    expect(hasDraft(KEY)).toBe(false);
  });
});
