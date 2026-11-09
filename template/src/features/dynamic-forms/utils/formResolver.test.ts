import { z } from 'zod';

import { createFormResolver } from './formResolver';

type Values = { name: string; nick: string; pet: { name: string } };

const schema = z.object({
  name: z.string().min(1, 'forms:validation.required'),
  nick: z.string().min(1, 'forms:validation.required'),
  pet: z.object({ name: z.string().min(1, 'forms:validation.required') }),
});

const options = {
  fields: {},
  shouldUseNativeValidation: false,
  criteriaMode: 'firstError' as const,
};

describe('createFormResolver', () => {
  it('returns the schema errors of visible fields', async () => {
    const resolver = createFormResolver<Values>({ schema, getHiddenNames: () => [] });
    const result = await resolver({ name: '', nick: '', pet: { name: '' } }, undefined, options);
    expect(Object.keys(result.errors)).toEqual(['name', 'nick', 'pet']);
  });

  it('AC-2: does not validate hidden fields and leaves them out of the values', async () => {
    const resolver = createFormResolver<Values>({
      schema,
      getHiddenNames: () => ['nick', 'pet.name'],
    });
    const result = await resolver({ name: 'Sam', nick: '', pet: { name: '' } }, undefined, options);
    expect(result.errors).toEqual({});
    expect(result.values).toEqual({ name: 'Sam' });
  });

  it('still reports the errors of the visible fields when others are hidden', async () => {
    const resolver = createFormResolver<Values>({ schema, getHiddenNames: () => ['nick'] });
    const result = await resolver({ name: '', nick: '', pet: { name: 'Rex' } }, undefined, options);
    expect(Object.keys(result.errors)).toEqual(['name']);
  });

  it('AC-3: turns a pending async error into a validation error, unless the field is hidden', async () => {
    const asyncErrors = new Map([['name', 'forms:validation.taken']]);
    const shown = createFormResolver<Values>({
      schema,
      getHiddenNames: () => [],
      getAsyncErrors: () => asyncErrors,
    });
    const values = { name: 'Sam', nick: 'S', pet: { name: 'Rex' } };
    const result = await shown(values, undefined, options);
    expect(result.errors).toMatchObject({
      name: { type: 'async', message: 'forms:validation.taken' },
    });
    const hidden = createFormResolver<Values>({
      schema,
      getHiddenNames: () => ['name'],
      getAsyncErrors: () => asyncErrors,
    });
    expect((await hidden(values, undefined, options)).errors).toEqual({});
  });

  it('AC-9: returns the parsed values when everything is valid', async () => {
    const resolver = createFormResolver<Values>({ schema, getHiddenNames: () => [] });
    const values = { name: 'Sam', nick: 'S', pet: { name: 'Rex' } };
    const result = await resolver(values, undefined, options);
    expect(result).toEqual({ values, errors: {} });
  });
});
