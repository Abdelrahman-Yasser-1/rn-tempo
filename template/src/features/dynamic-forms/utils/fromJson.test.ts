import type { FieldValues } from 'react-hook-form';
import { z } from 'zod';

import type { FormField } from '@features/dynamic-forms/types';
import { getHiddenNames } from '@features/dynamic-forms/utils/fieldTree';
import { createFormResolver } from '@features/dynamic-forms/utils/formResolver';
import { VALIDATION_MESSAGES as M } from '@features/dynamic-forms/utils/messages';

import { fromJson } from './fromJson';

const options = {
  fields: {},
  shouldUseNativeValidation: false,
  criteriaMode: 'firstError' as const,
};

const doc = {
  version: 1,
  id: 'signup',
  fields: [
    {
      type: 'select',
      name: 'kind',
      options: [
        { value: 'a', label: 'kinds.a' },
        { value: 'b', label: { en: 'B', ar: 'ب' } },
      ],
      rules: [{ rule: 'required' }],
    },
    {
      type: 'text',
      name: 'details',
      visibleIf: { field: 'kind', equals: 'b' },
      rules: [{ rule: 'required' }, { rule: 'minLength', value: 3 }],
    },
    { type: 'number', name: 'age', rules: [{ rule: 'min', value: 18 }] },
    { type: 'text', name: 'code', rules: [{ rule: 'pattern', name: 'digits' }] },
    {
      type: 'repeat',
      name: 'people',
      rules: [{ rule: 'minItems', value: 1 }],
      fields: [{ type: 'text', name: 'name', rules: [{ rule: 'required' }] }],
    },
  ],
};

type Values = {
  kind: string;
  details: string;
  age?: number;
  code: string;
  people: { name: string }[];
};

// The same form written by hand: typed fields with functions, and a hand-written Zod schema.
const codeFields: FormField<Values>[] = [
  {
    type: 'select',
    name: 'kind',
    options: [
      { value: 'a', label: 'kinds.a' },
      { value: 'b', label: { en: 'B', ar: 'ب' } },
    ],
  },
  { type: 'text', name: 'details', visibleIf: (values) => values.kind === 'b' },
  { type: 'number', name: 'age' },
  { type: 'text', name: 'code' },
  { type: 'repeat', name: 'people', fields: [{ type: 'text', name: 'name' }] },
];
const codeSchema = z.object({
  kind: z.string().min(1, M.required),
  details: z.string().min(1, M.required).min(3, M.tooShort),
  age: z.number().min(18, M.tooSmall).optional(),
  code: z.string().refine((value) => value === '' || /^\d+$/.test(value), M.digits),
  people: z.array(z.object({ name: z.string().min(1, M.required) })).min(1, M.tooFewItems),
});

function messages(errors: object, prefix = ''): Record<string, string> {
  return Object.entries(errors)
    .flatMap(([key, value]: [string, unknown]) => {
      if (typeof value !== 'object' || value === null) {
        return [];
      }
      const path = prefix === '' ? key : `${prefix}.${key}`;
      const entry = value as { message?: unknown; type?: unknown };
      return typeof entry.message === 'string' && typeof entry.type === 'string'
        ? [[path, entry.message] as [string, string]]
        : Object.entries(messages(value, path));
    })
    .reduce<Record<string, string>>((all, [path, message]) => ({ ...all, [path]: message }), {});
}

describe('fromJson', () => {
  it('AC-8: gives the typed config and a schema for a form', () => {
    const result = fromJson(doc);
    if (!result.success || result.form.kind !== 'form') {
      throw new Error('the document should be a valid form');
    }
    expect(result.form.id).toBe('signup');
    expect(result.form.fields.map((field) => ('name' in field ? field.name : field.type))).toEqual([
      'kind',
      'details',
      'age',
      'code',
      'people',
    ]);
    expect(result.form.draft).toBeUndefined();
  });

  it('AC-8: gives steps, the review flag and a draft key for a flow', () => {
    const result = fromJson({
      version: 1,
      id: 'kyc',
      draft: true,
      review: true,
      steps: [
        { id: 's1', title: 'steps.one', canGoBack: false, fields: [{ type: 'text', name: 'a' }] },
        {
          id: 's2',
          visibleIf: { field: 'a', equals: 'x' },
          fields: [{ type: 'text', name: 'b', rules: [{ rule: 'required' }] }],
        },
      ],
    });
    if (!result.success || result.form.kind !== 'flow') {
      throw new Error('the document should be a valid flow');
    }
    expect(result.form.review).toBe(true);
    expect(result.form.draft).toEqual({ key: 'json.kyc' });
    expect(result.form.steps[0]).toMatchObject({ id: 's1', canGoBack: false });
    expect(result.form.steps[1]?.visibleIf?.({ a: 'x' })).toBe(true);
    expect(result.form.steps[1]?.visibleIf?.({ a: 'y' })).toBe(false);
  });

  it('AC-8: reports why a bad document was refused', () => {
    const result = fromJson({ ...doc, fields: [{ type: 'eval', name: 'a' }] });
    expect(result.success).toBe(false);
  });

  it.each<[string, Partial<Values>]>([
    ['everything empty', { kind: '', details: '', code: '', people: [] }],
    ['a valid form', { kind: 'a', details: '', age: 20, code: '123', people: [{ name: 'Sam' }] }],
    ['kind b with short details', { kind: 'b', details: 'ab', code: '', people: [{ name: 'S' }] }],
    [
      'kind b with details',
      { kind: 'b', details: 'abc', age: 18, code: '', people: [{ name: 'S' }] },
    ],
    ['hidden details left empty', { kind: 'a', details: '', code: '', people: [{ name: 'S' }] }],
    [
      'a bad code and a young age',
      { kind: 'a', details: '', age: 17, code: '12x', people: [{ name: 'S' }] },
    ],
    [
      'an empty person',
      { kind: 'a', details: '', code: '', people: [{ name: 'S' }, { name: '' }] },
    ],
  ])('AC-8: the JSON form and the code form agree on %s', async (_label, values) => {
    const result = fromJson(doc);
    if (!result.success || result.form.kind !== 'form') {
      throw new Error('the document should be a valid form');
    }
    const jsonFields = result.form.fields;
    const fromJsonResolver = createFormResolver<FieldValues>({
      schema: result.form.schema,
      getHiddenNames: (current) => getHiddenNames(jsonFields, current),
    });
    const fromCodeResolver = createFormResolver<Values>({
      schema: codeSchema,
      getHiddenNames: (current) => getHiddenNames(codeFields, current),
    });
    const [json, code] = await Promise.all([
      fromJsonResolver(values, undefined, options),
      fromCodeResolver(values as Values, undefined, options),
    ]);
    expect(messages(json.errors)).toEqual(messages(code.errors));
    expect(Object.keys(json.errors).length === 0).toBe(Object.keys(code.errors).length === 0);
  });
});
