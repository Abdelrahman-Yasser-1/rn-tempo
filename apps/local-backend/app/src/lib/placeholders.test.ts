import { describe, expect, it } from 'vitest';

import { allowPlaceholders, isPlaceholderText, placeholderRanges } from './placeholders';

describe('AC-LP-6 placeholders in the editor', () => {
  it('AC-LP-6 finds {{...}} tokens and skips escaped, unclosed and nested ones', () => {
    const text = '{"a": "{{params.id}}", "b": "x {{ now.iso }} y", "c": "\\{{uuid}}", "d": "{{open", "e": "{{{bad}}"}';
    const found = placeholderRanges(text).map((range) => text.slice(range.from, range.to));
    expect(found).toEqual(['{{params.id}}', '{{ now.iso }}', '{{bad}}']);
  });

  it('AC-LP-6 knows a whole-string placeholder', () => {
    expect(isPlaceholderText('{{random.int 1 100}}')).toBe(true);
    expect(isPlaceholderText(' {{uuid}} ')).toBe(true);
    expect(isPlaceholderText('id {{uuid}}')).toBe(false);
    expect(isPlaceholderText(5)).toBe(false);
  });
});

describe('AC-LP-6 schema diagnostics ignore placeholders', () => {
  const schema = {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'integer' }, name: { type: 'string' }, kind: { type: 'string', enum: ['a', 'b'] }, tags: { type: 'array', items: { type: 'number' } }, owner: { type: 'object', properties: { age: { type: 'number' } } } },
  };

  it('AC-LP-6 lets a placeholder stand where a number, an enum, an item or an object is expected', () => {
    const widened = allowPlaceholders(schema) as { properties: Record<string, { anyOf?: unknown[]; items?: unknown; properties?: unknown }> };
    const placeholder = { type: 'string', pattern: '^\\s*\\{\\{[^{}]*\\}\\}\\s*$' };
    expect(widened.properties.id?.anyOf).toEqual([{ type: 'integer' }, placeholder]);
    expect(widened.properties.kind?.anyOf).toEqual([{ type: 'string', enum: ['a', 'b'] }, placeholder]);
    expect(widened.properties.tags?.anyOf?.[0]).toMatchObject({ type: 'array', items: { anyOf: [{ type: 'number' }, placeholder] } });
    const owner = widened.properties.owner?.anyOf?.[0] as { properties: { age: { anyOf: unknown[] } } };
    expect(owner.properties.age.anyOf[1]).toEqual(placeholder);
    // A plain string needs no help, and the root stays an object schema.
    expect(widened.properties.name).toEqual({ type: 'string' });
    expect(allowPlaceholders(schema)).toMatchObject({ type: 'object', required: ['id'] });
  });

  it('AC-LP-6 the placeholder pattern matches whole placeholders only', () => {
    const regex = new RegExp('^\\s*\\{\\{[^{}]*\\}\\}\\s*$');
    for (const ok of ['{{params.id}}', '{{ random.int 1 9 }}', '{{body.a.b}}']) expect(regex.test(ok)).toBe(true);
    for (const no of ['7', 'x {{uuid}}', '{{a}} {{b}}', '{{a']) expect(regex.test(no)).toBe(false);
  });

  it('AC-LP-6 does not change the schema it is given and leaves $ref and empty nodes alone', () => {
    const original = JSON.parse(JSON.stringify(schema)) as unknown;
    allowPlaceholders(schema);
    expect(schema).toEqual(original);
    expect(allowPlaceholders({ properties: { a: {} } })).toEqual({ properties: { a: {} } });
  });
});
