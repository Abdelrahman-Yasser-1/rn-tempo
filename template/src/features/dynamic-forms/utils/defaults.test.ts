import type { FormField } from '@features/dynamic-forms/types';

import {
  blankItem,
  buildInitialValues,
  buildResetValues,
  emptyValueFor,
  resetValueFor,
} from './defaults';

type Values = {
  name: string;
  agree: boolean;
  tags: string[];
  age: number;
  address: { city: string };
};

const fields: FormField<Values>[] = [
  { type: 'text', name: 'name' },
  { type: 'checkbox', name: 'agree' },
  { type: 'multiSelect', name: 'tags', options: [] },
  { type: 'number', name: 'age', defaultValue: 18 },
  { type: 'text', name: 'address.city', defaultValue: 'Cairo' },
];

describe('defaults', () => {
  it('gives each type its empty value', () => {
    expect(emptyValueFor('text')).toBe('');
    expect(emptyValueFor('checkbox')).toBe(false);
    expect(emptyValueFor('multiSelect')).toEqual([]);
    expect(emptyValueFor('select')).toBeUndefined();
  });

  it('prefers the field default over the empty value', () => {
    expect(resetValueFor({ type: 'number', defaultValue: 3 })).toBe(3);
    expect(resetValueFor({ type: 'text' })).toBe('');
  });

  it('builds nested initial values, with the caller defaults on top', () => {
    expect(buildInitialValues(fields, undefined)).toEqual({
      name: '',
      agree: false,
      tags: [],
      age: 18,
      address: { city: 'Cairo' },
    });
    expect(buildInitialValues(fields, { name: 'Sam', age: undefined })).toMatchObject({
      name: 'Sam',
      age: 18,
    });
  });

  it('lists the reset value of every field by path', () => {
    const resets = buildResetValues(fields);
    expect(resets.get('age')).toBe(18);
    expect(resets.get('address.city')).toBe('Cairo');
    expect(resets.get('name')).toBe('');
  });

  it('pads a repeat section to minItems with blank items', () => {
    type Repeated = { people: { name: string; age: number }[] };
    const repeated: FormField<Repeated>[] = [
      {
        type: 'repeat',
        name: 'people',
        minItems: 2,
        fields: [
          { type: 'text', name: 'name' },
          { type: 'number', name: 'age', defaultValue: 18 },
        ],
      },
    ];
    const blank = { name: '', age: 18 };
    expect(buildInitialValues(repeated, undefined)).toEqual({ people: [blank, blank] });
    expect(buildResetValues(repeated).get('people')).toEqual([blank, blank]);
    expect(blankItem([{ type: 'checkbox', name: 'agree' }])).toEqual({ agree: false });
  });
});
