import { z } from 'zod';

import {
  CONDITION_MAX_DEPTH,
  conditionDepth,
  conditionFields,
} from '@features/dynamic-forms/utils/conditions';
import type { Condition } from '@features/dynamic-forms/utils/conditions';
import { preCheckJson } from '@features/dynamic-forms/utils/jsonPreCheck';
import { header, JSON_LIMITS, node, step } from '@features/dynamic-forms/utils/jsonSchema';
import type {
  JsonLeafField,
  JsonNode,
  JsonRepeatField,
} from '@features/dynamic-forms/utils/jsonSchema';

/** Value fields of a node list (rows and groups opened), with their conditions. */
export function collectJsonFields(nodes: readonly JsonNode[]): (JsonLeafField | JsonRepeatField)[] {
  return nodes.flatMap((item): (JsonLeafField | JsonRepeatField)[] =>
    item.type === 'row' || item.type === 'group' ? collectJsonFields(item.fields) : [item],
  );
}

function conditionsOf(nodes: readonly JsonNode[]): Condition[] {
  return nodes.flatMap((item): Condition[] => {
    const own = [item.visibleIf, item.disabledIf].filter((entry) => entry !== undefined);
    return item.type === 'row' || item.type === 'group'
      ? [...own, ...conditionsOf(item.fields)]
      : own;
  });
}

function checkDocument(
  nodes: readonly JsonNode[],
  extra: readonly Condition[],
  ctx: z.RefinementCtx,
): void {
  const fail = (reason: string) => {
    ctx.addIssue({ code: 'custom', message: reason });
  };
  const fields = collectJsonFields(nodes);
  const names = fields.map((field) => field.name);
  if (fields.length > JSON_LIMITS.fields) {
    fail(`a form has at most ${String(JSON_LIMITS.fields)} fields`);
  }
  if (new Set(names).size !== names.length) {
    fail('field names must be unique');
  }
  const known = new Set(names);
  for (const condition of [...conditionsOf(nodes), ...extra]) {
    if (conditionDepth(condition) > CONDITION_MAX_DEPTH) {
      fail('a condition is nested too deeply');
    }
    if (conditionFields(condition).some((target) => !known.has(target))) {
      fail('a condition refers to a field that does not exist');
    }
  }
  for (const field of fields) {
    if (
      field.type !== 'repeat' &&
      (field.resetOnChange ?? []).some((target) => !known.has(target))
    ) {
      fail('resetOnChange refers to a field that does not exist');
    }
  }
}

export const formSchemaJsonSchema = z
  .strictObject({ ...header, fields: z.array(node).min(1).max(JSON_LIMITS.fields) })
  .superRefine((doc, ctx) => {
    checkDocument(doc.fields, [], ctx);
  });
export type FormSchemaJson = z.infer<typeof formSchemaJsonSchema>;

export const flowJsonSchema = z
  .strictObject({
    ...header,
    steps: z.array(step).min(1).max(JSON_LIMITS.steps),
    review: z.boolean().optional(),
  })
  .superRefine((doc, ctx) => {
    const ids = doc.steps.map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', message: 'step ids must be unique' });
    }
    checkDocument(
      doc.steps.flatMap((item) => item.fields),
      doc.steps.flatMap((item) => (item.visibleIf ? [item.visibleIf] : [])),
      ctx,
    );
  });
export type FlowJson = z.infer<typeof flowJsonSchema>;

export type ParsedFormJson =
  | Readonly<{ kind: 'form'; document: FormSchemaJson }>
  | Readonly<{ kind: 'flow'; document: FlowJson }>;

export type ParseResult =
  | Readonly<{ success: true; data: ParsedFormJson }>
  | Readonly<{ success: false; issues: readonly string[] }>;

/**
 * Validates a document: a `FlowJson` (has `steps`) or a `FormSchemaJson` (has `fields`). The
 * issues name the path and the rule, never the offending value.
 */
export function parseFormJson(input: unknown): ParseResult {
  const problem = preCheckJson(input);
  if (problem !== undefined) {
    return { success: false, issues: [problem] };
  }
  const isFlow = typeof input === 'object' && input !== null && 'steps' in input;
  let result;
  try {
    result = isFlow ? flowJsonSchema.safeParse(input) : formSchemaJsonSchema.safeParse(input);
  } catch {
    // The schema does not throw on data; if it ever does, the document is refused, not logged.
    return { success: false, issues: ['the document could not be read'] };
  }
  if (!result.success) {
    return {
      success: false,
      issues: result.error.issues.map(
        (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      ),
    };
  }
  return isFlow
    ? { success: true, data: { kind: 'flow', document: result.data as FlowJson } }
    : { success: true, data: { kind: 'form', document: result.data as FormSchemaJson } };
}
