import { describe, expect, it } from 'vitest';

import { defaultChoices, countChoices, setAll } from './importChoices';
import { schemaTree } from './schemaTree';

describe('schemaTree', () => {
  it('reads names, types, required, formats, limits and enums', () => {
    const tree = schemaTree({
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'integer', minimum: 1, maximum: 9 },
        email: { type: ['string', 'null'], format: 'email' },
        kind: { type: 'string', enum: ['a', 'b'] },
        tags: { type: 'array', items: { type: 'string', minLength: 2 }, minItems: 1 },
        shape: { oneOf: [{ type: 'object', properties: { r: { type: 'number' } } }, { type: 'string' }] },
      },
    });
    expect(tree.type).toBe('object');
    const byName = Object.fromEntries(tree.children.map((child) => [child.name, child]));
    expect(byName.id).toMatchObject({ type: 'integer', required: true, notes: ['1 to 9'] });
    expect(byName.email).toMatchObject({ type: 'string | null', required: false, notes: ['email'] });
    expect(byName.kind?.notes).toEqual(['one of: "a", "b"']);
    expect(byName.tags?.children[0]).toMatchObject({ name: '[item]', type: 'string', notes: ['at least 2 characters'] });
    expect(byName.shape?.type).toBe('one of');
    expect(byName.shape?.children.map((child) => child.name)).toEqual(['option 1', 'option 2']);
  });

  it('cuts a very deep schema instead of walking it all', () => {
    let schema: Record<string, unknown> = { type: 'string' };
    for (let i = 0; i < 30; i += 1) schema = { type: 'object', properties: { next: schema } };
    let depth = 0;
    for (let node = schemaTree(schema); node.children[0] !== undefined; node = node.children[0]) depth += 1;
    expect(depth).toBeLessThanOrEqual(9);
  });
});

describe('import choices', () => {
  const entry = (id: string, customized?: boolean) => ({ id, method: 'GET', path: `/${id}`, tags: [], ...(customized === undefined ? {} : { customized }) });
  const diff = { added: [entry('a'), entry('b')], removed: [entry('r')], changed: [entry('c1', true), entry('c2', false)], unchanged: [], skipped: [] };

  it('adds everything, deletes nothing, keeps what you edited and takes the rest', () => {
    expect(defaultChoices(diff)).toEqual({ add: { a: true, b: true }, remove: { r: false }, change: { c1: 'keep-mine', c2: 'take-new' } });
  });

  it('counts what an apply would do, and sets all at once', () => {
    const choices = defaultChoices(diff);
    expect(countChoices(choices)).toEqual({ added: 2, removed: 0, changed: 1 });
    expect(countChoices({ ...choices, add: setAll(choices.add, false), remove: setAll(choices.remove, true) })).toEqual({ added: 0, removed: 1, changed: 1 });
  });
});
