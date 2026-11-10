import { get } from 'react-hook-form';
import type { FieldValues } from 'react-hook-form';
import { z } from 'zod';

import { isEqual } from '@features/dynamic-forms/utils/equal';

/**
 * Declarative conditions for server-driven forms. They are data, never code: one comparison of a
 * field, or `all` / `any` / `not` over other conditions. There is nothing to evaluate but
 * `evaluateCondition`.
 */

export type ConditionValue = string | number | boolean | null;

type Leaf =
  | { field: string; equals: ConditionValue }
  | { field: string; notEquals: ConditionValue }
  | { field: string; in: ConditionValue[] }
  | { field: string; notIn: ConditionValue[] }
  | { field: string; gt: number }
  | { field: string; lt: number }
  | { field: string; isEmpty: true }
  | { field: string; isNotEmpty: true };

export type Condition = Leaf | { all: Condition[] } | { any: Condition[] } | { not: Condition };

/** Deepest nesting of `all` / `any` / `not` a document may use. */
export const CONDITION_MAX_DEPTH = 4;
const MAX_LIST = 50;
const MAX_CHILDREN = 20;

const name = z.string().min(1).max(60);
const value = z.union([z.string().max(200), z.number(), z.boolean(), z.null()]);
const list = z.array(value).max(MAX_LIST);

const leaf = z.union([
  z.strictObject({ field: name, equals: value }),
  z.strictObject({ field: name, notEquals: value }),
  z.strictObject({ field: name, in: list }),
  z.strictObject({ field: name, notIn: list }),
  z.strictObject({ field: name, gt: z.number() }),
  z.strictObject({ field: name, lt: z.number() }),
  z.strictObject({ field: name, isEmpty: z.literal(true) }),
  z.strictObject({ field: name, isNotEmpty: z.literal(true) }),
]);

/**
 * The schema of a condition that may nest `all` / `any` / `not` `CONDITION_MAX_DEPTH - depth`
 * more times. Built eagerly, level by level, so the schema is finite and parsing a deep input
 * fails at the first level that does not allow another combinator (no unbounded recursion).
 */
function conditionAt(depth: number): z.ZodType<Condition> {
  if (depth >= CONDITION_MAX_DEPTH) {
    return leaf;
  }
  const child = conditionAt(depth + 1);
  return z.union([
    leaf,
    z.strictObject({ all: z.array(child).min(1).max(MAX_CHILDREN) }),
    z.strictObject({ any: z.array(child).min(1).max(MAX_CHILDREN) }),
    z.strictObject({ not: child }),
  ]);
}

export const conditionSchema: z.ZodType<Condition> = conditionAt(0);

/** Nesting depth of a condition (a leaf is 0). */
export function conditionDepth(condition: Condition): number {
  if ('all' in condition) {
    return 1 + Math.max(...condition.all.map(conditionDepth));
  }
  if ('any' in condition) {
    return 1 + Math.max(...condition.any.map(conditionDepth));
  }
  return 'not' in condition ? 1 + conditionDepth(condition.not) : 0;
}

/** Every field name a condition refers to. */
export function conditionFields(condition: Condition): string[] {
  if ('all' in condition) {
    return condition.all.flatMap(conditionFields);
  }
  if ('any' in condition) {
    return condition.any.flatMap(conditionFields);
  }
  return 'not' in condition ? conditionFields(condition.not) : [condition.field];
}

function isEmptyValue(item: unknown): boolean {
  return (
    item === undefined || item === null || item === '' || (Array.isArray(item) && item.length === 0)
  );
}

function asNumber(item: unknown): number | undefined {
  if (typeof item === 'number') {
    return item;
  }
  return typeof item === 'string' && item.trim() !== '' && Number.isFinite(Number(item))
    ? Number(item)
    : undefined;
}

function evaluateLeaf(condition: Leaf, actual: unknown): boolean {
  if ('equals' in condition) {
    return isEqual(actual, condition.equals);
  }
  if ('notEquals' in condition) {
    return !isEqual(actual, condition.notEquals);
  }
  if ('in' in condition) {
    return condition.in.some((item) => isEqual(actual, item));
  }
  if ('notIn' in condition) {
    return !condition.notIn.some((item) => isEqual(actual, item));
  }
  if ('gt' in condition) {
    const number = asNumber(actual);
    return number !== undefined && number > condition.gt;
  }
  if ('lt' in condition) {
    const number = asNumber(actual);
    return number !== undefined && number < condition.lt;
  }
  return 'isEmpty' in condition ? isEmptyValue(actual) : !isEmptyValue(actual);
}

/** Evaluates a condition against the form values. Pure; unknown fields count as empty. */
export function evaluateCondition(condition: Condition, values: FieldValues): boolean {
  if ('all' in condition) {
    return condition.all.every((child) => evaluateCondition(child, values));
  }
  if ('any' in condition) {
    return condition.any.some((child) => evaluateCondition(child, values));
  }
  return 'not' in condition
    ? !evaluateCondition(condition.not, values)
    : evaluateLeaf(condition, get(values, condition.field));
}
