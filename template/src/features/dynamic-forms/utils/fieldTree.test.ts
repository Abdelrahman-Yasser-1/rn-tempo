import type { FormField } from '@features/dynamic-forms/types';

import {
  getFieldKey,
  getHiddenNames,
  getValueFields,
  getVisibleNames,
  isNeverPersisted,
  isSensitive,
  walkFields,
} from './fieldTree';

type Values = { kind: string; a: string; b: string; c: string; pin: string };

const kindField: FormField<Values> = { type: 'text', name: 'kind' };
const groupField: FormField<Values> = {
  type: 'group',
  visibleIf: (values) => values.kind === 'x',
  fields: [
    { type: 'text', name: 'a' },
    { type: 'row', fields: [{ type: 'text', name: 'b', visibleIf: () => false }] },
  ],
};
const fields: FormField<Values>[] = [
  kindField,
  groupField,
  { type: 'custom', render: () => null },
  { type: 'text', name: 'c' },
];

describe('fieldTree', () => {
  it('walks rows and groups and skips custom fields', () => {
    expect(getValueFields(fields).map((field) => field.name)).toEqual(['kind', 'a', 'b', 'c']);
  });

  it('reports a field hidden by its own rule or by a parent', () => {
    const values = { kind: 'y' } as Values;
    expect(getHiddenNames(fields, values)).toEqual(['a', 'b']);
    expect(getVisibleNames(fields, values)).toEqual(['kind', 'c']);
    const shown = { kind: 'x' } as Values;
    expect(getHiddenNames(fields, shown)).toEqual(['b']);
    expect(walkFields(fields, shown).map(({ isVisible }) => isVisible)).toEqual([
      true,
      true,
      false,
      true,
    ]);
  });

  it('marks otp, secure text and explicit sensitive fields as sensitive', () => {
    expect(isSensitive({ type: 'otp' })).toBe(true);
    expect(isSensitive({ type: 'text', props: { secureTextEntry: true } })).toBe(true);
    expect(isSensitive({ type: 'text', sensitive: true })).toBe(true);
    expect(isSensitive({ type: 'text' })).toBe(false);
    expect(isSensitive({ type: 'otp', sensitive: false })).toBe(false);
  });

  it('never persists sensitive or file fields', () => {
    expect(isNeverPersisted({ type: 'file' })).toBe(true);
    expect(isNeverPersisted({ type: 'multiFile' })).toBe(true);
    expect(isNeverPersisted({ type: 'otp' })).toBe(true);
    expect(isNeverPersisted({ type: 'select' })).toBe(false);
  });

  it('keys value fields by path and layouts by type and index', () => {
    expect(getFieldKey(kindField, 0)).toBe('kind');
    expect(getFieldKey(groupField, 1)).toBe('group-1');
  });
});
