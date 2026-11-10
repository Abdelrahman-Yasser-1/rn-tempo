import { buildZodSchema } from './buildZodSchema';
import { collectJsonFields, parseFormJson } from './jsonDocument';
import type { FormSchemaJson } from './jsonDocument';

function schemaOf(fields: unknown[]) {
  const parsed = parseFormJson({ version: 1, id: 'test', fields });
  if (!parsed.success || parsed.data.kind !== 'form') {
    throw new Error(parsed.success ? 'not a form' : parsed.issues.join());
  }
  const document: FormSchemaJson = parsed.data.document;
  return buildZodSchema(collectJsonFields(document.fields));
}

function messagesOf(schema: ReturnType<typeof schemaOf>, value: unknown): string[] {
  const result = schema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('buildZodSchema', () => {
  it('AC-8: required reports the forms message, and optional empty values skip other rules', () => {
    const schema = schemaOf([
      { type: 'text', name: 'a', rules: [{ rule: 'required' }, { rule: 'minLength', value: 3 }] },
      { type: 'text', name: 'b', rules: [{ rule: 'minLength', value: 3 }] },
    ]);
    expect(messagesOf(schema, { a: '', b: '' })).toEqual(['forms:validation.required']);
    expect(messagesOf(schema, { a: 'ab', b: 'ab' })).toEqual([
      'forms:validation.tooShort',
      'forms:validation.tooShort',
    ]);
    expect(messagesOf(schema, { a: 'abc', b: '' })).toEqual([]);
  });

  it.each([
    ['maxLength', { rule: 'maxLength', value: 2 }, 'abc', 'forms:validation.tooLong'],
    ['email', { rule: 'email' }, 'not-an-email', 'forms:validation.email'],
    ['phone', { rule: 'phone' }, '123', 'forms:validation.phone'],
    ['pattern', { rule: 'pattern', name: 'digits' }, 'abc', 'forms:validation.digits'],
    ['a custom message', { rule: 'email', message: 'email.invalid' }, 'x', 'email.invalid'],
  ])('AC-8: %s', (_label, rule, value, message) => {
    const schema = schemaOf([{ type: 'text', name: 'a', rules: [rule] }]);
    expect(messagesOf(schema, { a: value })).toEqual([message]);
  });

  it('AC-8: checks numbers, lists and required checkboxes', () => {
    const schema = schemaOf([
      {
        type: 'number',
        name: 'n',
        rules: [
          { rule: 'min', value: 5 },
          { rule: 'max', value: 10 },
        ],
      },
      {
        type: 'multiSelect',
        name: 'tags',
        options: [{ value: 'a', label: 'x.a' }],
        rules: [
          { rule: 'minItems', value: 1 },
          { rule: 'maxItems', value: 2 },
        ],
      },
      { type: 'checkbox', name: 'agree', rules: [{ rule: 'required' }] },
    ]);
    expect(messagesOf(schema, { n: 1, tags: ['a'], agree: true })).toEqual([
      'forms:validation.tooSmall',
    ]);
    expect(messagesOf(schema, { n: 11, tags: ['a'], agree: true })).toEqual([
      'forms:validation.tooBig',
    ]);
    expect(messagesOf(schema, { n: 6, tags: ['a', 'b', 'c'], agree: true })).toEqual([
      'forms:validation.tooManyItems',
    ]);
    expect(messagesOf(schema, { n: 6, tags: ['a'], agree: false })).toEqual([
      'forms:validation.required',
    ]);
  });

  it('AC-5: validates each repeat item at its own path', () => {
    const schema = schemaOf([
      {
        type: 'repeat',
        name: 'people',
        rules: [{ rule: 'minItems', value: 1 }],
        fields: [{ type: 'text', name: 'name', rules: [{ rule: 'required' }] }],
      },
    ]);
    const result = schema.safeParse({ people: [{ name: 'Sam' }, { name: '' }] });
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'))).toEqual([
      'people.1.name',
    ]);
    expect(messagesOf(schema, { people: [] })).toEqual(['forms:validation.tooFewItems']);
  });

  it('drops keys the document does not declare', () => {
    const schema = schemaOf([{ type: 'text', name: 'a' }]);
    expect(schema.parse({ a: 'x', other: 'y' })).toEqual({ a: 'x' });
  });
});
