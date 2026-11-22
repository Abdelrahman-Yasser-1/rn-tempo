import { describe, expect, it } from 'vitest';

import { fieldsFor, getAt, inferSchema, parseScalar, readText, schemaFromFields, setAt } from './jsonForm';

const schema = {
  type: 'object',
  required: ['name'],
  properties: {
    name: { type: 'string', description: 'The name.' },
    age: { type: ['integer', 'null'] },
    price: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    active: { type: 'boolean' },
    kind: { type: 'string', enum: ['a', 'b'] },
    owner: { type: 'object', properties: { city: { type: 'string' } } },
    tags: { type: 'array', items: { type: 'string' } },
  },
};

describe('AC-LP-6 the form is made from the schema', () => {
  it('AC-LP-6 lists every property with a kind, and keeps extra keys of the value as JSON', () => {
    const fields = fieldsFor(schema, { name: 'x', extra: 1 });
    expect(fields.map((field) => [field.name, field.kind, field.required])).toEqual([
      ['name', 'string', true],
      ['age', 'integer', false],
      ['price', 'number', false],
      ['active', 'boolean', false],
      ['kind', 'enum', false],
      ['owner', 'object', false],
      ['tags', 'json', false],
      ['extra', 'json', false],
    ]);
    expect(fields.find((field) => field.name === 'owner')?.children?.map((child) => child.path)).toEqual([['owner', 'city']]);
    expect(fields.find((field) => field.name === 'name')?.description).toBe('The name.');
    expect(fields.find((field) => field.name === 'kind')?.enumValues).toEqual(['a', 'b']);
  });

  it('AC-LP-6 is made from collection fields', () => {
    const made = schemaFromFields([
      { name: 'title', type: 'string', required: true },
      { name: 'price', type: 'number' },
      { name: 'owner', type: 'relation', relationTo: 'users' },
      { name: 'on', type: 'boolean' },
      { name: 'kind', type: 'enum', enumValues: ['x'] },
      { name: 'meta', type: 'json' },
    ]);
    expect(fieldsFor(made, {}).map((field) => [field.name, field.kind])).toEqual([['title', 'string'], ['price', 'number'], ['owner', 'number'], ['on', 'boolean'], ['kind', 'enum'], ['meta', 'json']]);
    expect(made).toMatchObject({ required: ['title'] });
  });

  it('AC-LP-6 follows the value itself when there is no schema', () => {
    expect(fieldsFor(inferSchema({ a: 1, b: 'x', c: { d: true } }), { a: 1, b: 'x', c: { d: true } }).map((field) => [field.name, field.kind])).toEqual([['a', 'number'], ['b', 'string'], ['c', 'object']]);
  });
});

describe('AC-LP-6 editing a value from the form', () => {
  it('AC-LP-6 sets, nests and removes keys without changing the original', () => {
    const original = { a: 1, owner: { city: 'x' } };
    const next = setAt(original, ['owner', 'city'], 'y') as typeof original;
    expect(next).toEqual({ a: 1, owner: { city: 'y' } });
    expect(original.owner.city).toBe('x');
    expect(setAt(original, ['a'], undefined)).toEqual({ owner: { city: 'x' } });
    expect(setAt(undefined, ['a', 'b'], 1)).toEqual({ a: { b: 1 } });
    expect(getAt(next, ['owner', 'city'])).toBe('y');
    expect(getAt(next, ['nope', 'x'])).toBeUndefined();
  });

  it('AC-LP-6 treats __proto__ as a plain key', () => {
    const next = setAt({}, ['__proto__'], { polluted: true }) as Record<string, unknown>;
    expect(Object.getPrototypeOf(next)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.hasOwn(next, '__proto__')).toBe(true);
  });

  it('AC-LP-6 reads a number box as a number or a {{placeholder}}, and an empty box as "remove"', () => {
    expect(parseScalar('number', '12.5')).toEqual({ ok: true, value: 12.5 });
    expect(parseScalar('integer', '{{params.id | number}}')).toEqual({ ok: true, value: '{{params.id | number}}' });
    expect(parseScalar('number', '')).toEqual({ ok: true, value: undefined });
    expect(parseScalar('number', 'abc')).toMatchObject({ ok: false });
    expect(parseScalar('integer', '1.5')).toMatchObject({ ok: false });
    expect(parseScalar('string', '  keep spaces ')).toEqual({ ok: true, value: '  keep spaces ' });
    expect(parseScalar('json', '[1,2]')).toEqual({ ok: true, value: [1, 2] });
    expect(parseScalar('json', '[1,')).toMatchObject({ ok: false });
  });

  it('AC-LP-6 reads JSON text and says why it cannot', () => {
    expect(readText('  ')).toEqual({ ok: true, value: undefined });
    expect(readText('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(readText('{"a":').ok).toBe(false);
  });
});
