import { parseFormJson } from './jsonDocument';
import { JSON_LIMITS } from './jsonSchema';

const label = { en: 'Label', ar: 'تسمية' };

function form(fields: unknown[]) {
  return { version: 1, id: 'test', fields };
}

function issuesOf(input: unknown): string {
  const result = parseFormJson(input);
  return result.success ? '' : result.issues.join('\n');
}

describe('parseFormJson', () => {
  it('AC-8: accepts a form and a flow', () => {
    const fields = [
      { type: 'text', name: 'name', label, rules: [{ rule: 'required' }] },
      { type: 'select', name: 'kind', options: [{ value: 'a', label: 'kinds.a' }] },
    ];
    expect(parseFormJson(form(fields))).toMatchObject({ success: true, data: { kind: 'form' } });
    expect(
      parseFormJson({ version: 1, id: 'flow', steps: [{ id: 's1', title: label, fields }] }),
    ).toMatchObject({ success: true, data: { kind: 'flow' } });
  });

  it.each([
    ['an unknown field type', form([{ type: 'eval', name: 'a' }])],
    ['a code-only file type', form([{ type: 'file', name: 'a' }])],
    [
      'a function-like key on a field',
      form([{ type: 'text', name: 'a', calculatedValue: 'a + b' }]),
    ],
    ['an asyncValidate key', form([{ type: 'text', name: 'a', asyncValidate: 'fetch(1)' }])],
    ['a custom layout', form([{ type: 'custom', render: 'x' }])],
    [
      'an expression string as a condition',
      form([{ type: 'text', name: 'a', visibleIf: 'values.b === 1' }]),
    ],
    ['an unknown document key', { ...form([{ type: 'text', name: 'a' }]), onSubmit: 'x' }],
    ['an unknown version', { version: 2, id: 'a', fields: [{ type: 'text', name: 'a' }] }],
    ['a reserved field name', form([{ type: 'text', name: 'constructor' }])],
    ['a field name with a dot', form([{ type: 'text', name: 'a.b' }])],
    ['a label with spaces as a key', form([{ type: 'text', name: 'a', label: 'drop table' }])],
  ])('AC-8: rejects %s', (_label, input) => {
    expect(parseFormJson(input).success).toBe(false);
  });

  it('AC-8: rejects a __proto__ key from JSON.parse', () => {
    const input: unknown = JSON.parse(
      '{"version":1,"id":"a","fields":[{"type":"text","name":"a","__proto__":{"polluted":true}}]}',
    );
    expect(parseFormJson(input).success).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('AC-8: rejects a raw regex source and an unknown pattern name', () => {
    const rule = (item: unknown) => form([{ type: 'text', name: 'a', rules: [item] }]);
    expect(parseFormJson(rule({ rule: 'pattern', name: 'digits' })).success).toBe(true);
    expect(parseFormJson(rule({ rule: 'pattern', name: 'nope' })).success).toBe(false);
    expect(parseFormJson(rule({ rule: 'pattern', value: '^(a+)+$' })).success).toBe(false);
    expect(parseFormJson(rule({ rule: 'pattern', name: 'digits', value: '.*' })).success).toBe(
      false,
    );
    expect(parseFormJson(rule({ rule: 'pattern' })).success).toBe(false);
  });

  it('AC-8: checks rules against the field type, options and props', () => {
    expect(
      issuesOf(form([{ type: 'checkbox', name: 'a', rules: [{ rule: 'minLength', value: 2 }] }])),
    ).toContain('does not apply');
    expect(issuesOf(form([{ type: 'text', name: 'a', options: [] }]))).toContain('options');
    expect(issuesOf(form([{ type: 'select', name: 'a' }]))).toContain('options');
    expect(issuesOf(form([{ type: 'text', name: 'a', props: { onPress: 'x' } }]))).toContain(
      'props',
    );
    expect(issuesOf(form([{ type: 'text', name: 'a', props: { keyboardType: 'bad' } }]))).toContain(
      'props',
    );
    expect(issuesOf(form([{ type: 'slider', name: 'a' }]))).toContain('slider');
    expect(
      parseFormJson(form([{ type: 'text', name: 'a', props: { keyboardType: 'numeric' } }]))
        .success,
    ).toBe(true);
  });

  it('AC-8: checks names, conditions and limits across the document', () => {
    const text = (name: string, extra: object = {}) => ({ type: 'text', name, ...extra });
    expect(issuesOf(form([text('a'), text('a')]))).toContain('unique');
    expect(issuesOf(form([text('a', { visibleIf: { field: 'zzz', equals: 1 } })]))).toContain(
      'does not exist',
    );
    expect(issuesOf(form([text('a', { resetOnChange: ['zzz'] })]))).toContain('resetOnChange');
    const deep = { not: { not: { not: { not: { not: { field: 'a', isEmpty: true } } } } } };
    expect(parseFormJson(form([text('a', { visibleIf: deep })])).success).toBe(false);
    const many = Array.from({ length: JSON_LIMITS.fields + 1 }, (_item, index) =>
      text(`f${String(index)}`),
    );
    expect(parseFormJson(form(many)).success).toBe(false);
    expect(
      issuesOf({
        version: 1,
        id: 'f',
        steps: [
          { id: 's', fields: [text('a')] },
          { id: 's', fields: [text('b')] },
        ],
      }),
    ).toContain('step ids');
  });

  it('AC-8: a 10,000-level nested condition is rejected quickly without throwing', () => {
    let condition: unknown = { field: 'a', isEmpty: true };
    for (let level = 0; level < 10_000; level += 1) {
      condition = { not: condition };
    }
    const input = form([{ type: 'text', name: 'a', visibleIf: condition }]);
    const started = performance.now();
    expect(() => parseFormJson(input)).not.toThrow();
    expect(issuesOf(input)).toContain('nested too deeply');
    expect(performance.now() - started).toBeLessThan(200);
  });

  it('AC-8: rejects an oversized array, string, object and value count', () => {
    const text = (name: string) => ({ type: 'text', name });
    const longArray = form(
      Array.from({ length: JSON_LIMITS.arrayLength + 1 }, (_i, n) => text(`f${String(n)}`)),
    );
    expect(issuesOf(longArray)).toContain('array that is too long');
    const longString = form([
      { type: 'text', name: 'a', defaultValue: 'z'.repeat(JSON_LIMITS.stringLength + 1) },
    ]);
    expect(issuesOf(longString)).toContain('string that is too long');
    const manyKeys = Object.fromEntries(
      Array.from({ length: JSON_LIMITS.arrayLength + 1 }, (_i, n) => [`k${String(n)}`, 1]),
    );
    expect(issuesOf({ ...form([text('a')]), ...manyKeys })).toContain('too many keys');
    const manyValues = form(
      Array.from({ length: JSON_LIMITS.fields }, (_i, n) => ({
        type: 'select',
        name: `s${String(n)}`,
        options: Array.from({ length: JSON_LIMITS.options }, (_o, m) => ({
          value: `v${String(m)}`,
          label: 'x.y',
        })),
      })),
    );
    expect(issuesOf(manyValues)).toContain('too many values');
  });

  it('AC-8: rejects input that is not plain JSON, and a cyclic one', () => {
    expect(issuesOf(form([{ type: 'text', name: 'a', label: () => 'x' }]))).toContain('plain JSON');
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => parseFormJson(cyclic)).not.toThrow();
    expect(parseFormJson(cyclic).success).toBe(false);
  });

  it('AC-8: a normal document still parses', () => {
    expect(
      parseFormJson(form([{ type: 'text', name: 'a', label, rules: [{ rule: 'required' }] }]))
        .success,
    ).toBe(true);
  });

  it('never puts the offending value in an issue', () => {
    expect(
      issuesOf(form([{ type: 'text', name: 'a', visibleIf: 'SECRET-EXPRESSION' }])),
    ).not.toContain('SECRET-EXPRESSION');
  });
});
