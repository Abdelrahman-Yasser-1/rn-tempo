import { conditionDepth, conditionFields, conditionSchema, evaluateCondition } from './conditions';
import type { Condition } from './conditions';

const values = { kind: 'a', age: 30, text: '42', empty: '', list: [], nested: { x: true } };

describe('evaluateCondition', () => {
  it.each<[string, Condition, boolean]>([
    ['equals', { field: 'kind', equals: 'a' }, true],
    ['equals no', { field: 'kind', equals: 'b' }, false],
    ['equals nested', { field: 'nested.x', equals: true }, true],
    ['notEquals', { field: 'kind', notEquals: 'b' }, true],
    ['in', { field: 'kind', in: ['x', 'a'] }, true],
    ['notIn', { field: 'kind', notIn: ['a'] }, false],
    ['gt', { field: 'age', gt: 18 }, true],
    ['gt on numeric text', { field: 'text', gt: 40 }, true],
    ['gt on text', { field: 'kind', gt: 1 }, false],
    ['lt', { field: 'age', lt: 18 }, false],
    ['isEmpty on empty text', { field: 'empty', isEmpty: true }, true],
    ['isEmpty on empty list', { field: 'list', isEmpty: true }, true],
    ['isEmpty on missing', { field: 'missing', isEmpty: true }, true],
    ['isNotEmpty', { field: 'kind', isNotEmpty: true }, true],
    [
      'all',
      {
        all: [
          { field: 'kind', equals: 'a' },
          { field: 'age', gt: 40 },
        ],
      },
      false,
    ],
    [
      'any',
      {
        any: [
          { field: 'kind', equals: 'b' },
          { field: 'age', gt: 18 },
        ],
      },
      true,
    ],
    ['not', { not: { field: 'kind', equals: 'a' } }, false],
  ])('AC-8: %s', (_label, condition, isExpected) => {
    expect(evaluateCondition(condition, values)).toBe(isExpected);
  });

  it('measures depth and lists fields', () => {
    const condition: Condition = {
      all: [{ not: { field: 'a', equals: 1 } }, { any: [{ field: 'b', isEmpty: true }] }],
    };
    expect(conditionDepth(condition)).toBe(2);
    expect(conditionFields(condition)).toEqual(['a', 'b']);
  });
});

describe('conditionSchema', () => {
  it('AC-8: accepts declarative conditions', () => {
    expect(conditionSchema.safeParse({ all: [{ field: 'a', equals: 'x' }] }).success).toBe(true);
  });

  it.each([
    ['an expression string', 'values.a === 1'],
    ['an unknown operator', { field: 'a', matches: '.*' }],
    ['two operators', { field: 'a', equals: 1, gt: 2 }],
    ['an unknown key', { field: 'a', equals: 1, run: 'x' }],
    ['an empty all', { all: [] }],
    ['a function-like value', { field: 'a', equals: { toString: 'x' } }],
  ])('AC-8: rejects %s', (_label, input) => {
    expect(conditionSchema.safeParse(input).success).toBe(false);
  });
});
