import type { FormField } from '@features/dynamic-forms/types';

import { buildReviewItems, formatReviewValue } from './review';
import type { ReviewContext } from './review';

const ctx: ReviewContext = {
  resolve: (text) => (typeof text === 'string' ? text : text?.en),
  locale: 'en',
  yes: 'Yes',
  no: 'No',
  empty: 'Not provided',
  itemHeading: (label, index) => `${label ?? 'Item'} ${String(index)}`,
};

type Values = {
  name: string;
  agree: boolean;
  plan: string;
  tags: string[];
  born: string;
  month: string;
  age: number;
  password: string;
  hidden: string;
  slot: string;
  people: { name: string; ssn: string }[];
};

const fields: FormField<Values>[] = [
  { type: 'text', name: 'name', label: 'Name' },
  { type: 'checkbox', name: 'agree', label: 'Agree' },
  {
    type: 'select',
    name: 'plan',
    label: 'Plan',
    options: [{ value: 'pro', label: { en: 'Pro plan', ar: 'باقة' } }],
  },
  {
    type: 'multiSelect',
    name: 'tags',
    label: 'Tags',
    options: [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ],
  },
  { type: 'date', name: 'born', label: 'Born' },
  { type: 'monthYear', name: 'month', label: 'Month' },
  { type: 'number', name: 'age', label: 'Age' },
  { type: 'text', name: 'password', label: 'Password', props: { secureTextEntry: true } },
  { type: 'text', name: 'hidden', label: 'Hidden', visibleIf: () => false },
  {
    type: 'timeSlot',
    name: 'slot',
    label: 'Slot',
    props: { slots: [{ value: '09:00', label: 'Morning' }] },
  },
  {
    type: 'repeat',
    name: 'people',
    itemLabel: 'Person',
    fields: [
      { type: 'text', name: 'name', label: 'Name' },
      { type: 'text', name: 'ssn', label: 'SSN', sensitive: true },
    ],
  },
];

const values: Values = {
  name: 'Sam',
  agree: false,
  plan: 'pro',
  tags: ['a', 'b'],
  born: '2000-02-03',
  month: '2026-11',
  age: 1234,
  password: 'hunter2',
  hidden: 'nope',
  slot: '09:00',
  people: [{ name: 'Alex', ssn: '123' }],
};

describe('buildReviewItems', () => {
  it('AC-7: lists visible, non-sensitive fields with formatted values', () => {
    const items = buildReviewItems(fields, values, ctx);
    expect(items.map((item) => item.key)).toEqual([
      'name',
      'agree',
      'plan',
      'tags',
      'born',
      'month',
      'age',
      'slot',
      'people.0',
    ]);
    const byKey = Object.fromEntries(items.map((item) => [item.key, item.value]));
    expect(byKey).toMatchObject({
      name: 'Sam',
      agree: 'No',
      plan: 'Pro plan',
      tags: 'Alpha, Beta',
      age: '1,234',
      slot: 'Morning',
    });
    expect(byKey.born).toContain('2000');
    expect(byKey.month).toContain('2026');
    expect(JSON.stringify(items)).not.toContain('hunter2');
    expect(JSON.stringify(items)).not.toContain('123"');
  });

  it('AC-7: a repeat item shows its non-sensitive fields on separate lines', () => {
    const [item] = buildReviewItems(fields.slice(-1), values, ctx);
    expect(item).toEqual({ key: 'people.0', label: 'Person 1', value: 'Name: Alex' });
  });

  it('shows the empty text for a field left blank', () => {
    expect(formatReviewValue({ type: 'text', name: 'x' }, '', ctx)).toBe('Not provided');
    expect(formatReviewValue({ type: 'multiSelect', name: 'x' }, [], ctx)).toBe('Not provided');
    expect(formatReviewValue({ type: 'date', name: 'x' }, 'not a date', ctx)).toBe('Not provided');
  });

  it('formats files and locations', () => {
    expect(formatReviewValue({ type: 'file', name: 'x' }, { name: 'a.pdf' }, ctx)).toBe('a.pdf');
    expect(
      formatReviewValue(
        { type: 'multiFile', name: 'x' },
        [{ name: 'a.pdf' }, { name: 'b.png' }],
        ctx,
      ),
    ).toBe('a.pdf, b.png');
    expect(formatReviewValue({ type: 'map', name: 'x' }, { latitude: 1, longitude: 2 }, ctx)).toBe(
      '1, 2',
    );
    expect(
      formatReviewValue(
        { type: 'map', name: 'x' },
        { latitude: 1, longitude: 2, address: 'Home' },
        ctx,
      ),
    ).toBe('Home');
  });
});
