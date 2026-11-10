import type { FieldValues } from 'react-hook-form';
import type { z } from 'zod';

import type { StepConfig } from '@features/dynamic-forms/components/MultiStepFormBuilder/types';
import type { DraftConfig, FormField } from '@features/dynamic-forms/types';
import { buildZodSchema } from '@features/dynamic-forms/utils/buildZodSchema';
import { evaluateCondition } from '@features/dynamic-forms/utils/conditions';
import type { Condition } from '@features/dynamic-forms/utils/conditions';
import { collectJsonFields, parseFormJson } from '@features/dynamic-forms/utils/jsonDocument';
import type {
  JsonItemField,
  JsonLeafField,
  JsonNode,
  JsonRepeatField,
} from '@features/dynamic-forms/utils/jsonSchema';

type Schema = z.ZodType<Record<string, unknown>, FieldValues>;

/** A document turned into what the builders take. */
export type BuiltForm =
  | Readonly<{
      kind: 'form';
      id: string;
      fields: FormField<FieldValues>[];
      schema: Schema;
      draft: DraftConfig | undefined;
    }>
  | Readonly<{
      kind: 'flow';
      id: string;
      steps: StepConfig<FieldValues>[];
      schema: Schema;
      review: boolean;
      draft: DraftConfig | undefined;
    }>;

export type FromJsonResult =
  | Readonly<{ success: true; form: BuiltForm }>
  | Readonly<{ success: false; issues: readonly string[] }>;

const toRule = (condition: Condition | undefined) =>
  condition ? (values: FieldValues) => evaluateCondition(condition, values) : undefined;

function isRequired(field: Readonly<{ rules?: readonly { rule: string }[] }>): boolean {
  return field.rules?.some((item) => item.rule === 'required') ?? false;
}

function without<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function typeSpecific(field: JsonLeafField | JsonItemField) {
  if (field.type === 'timeSlot') {
    // Slot labels are the times themselves; a document cannot localize them.
    const slots = (field.options ?? []).map((option) => ({
      value: option.value,
      disabled: option.disabled,
    }));
    return { props: { ...field.props, slots } };
  }
  return { ...(field.options ? { options: field.options } : {}), props: field.props };
}

// The cast is the one place a document's field type string meets the typed union; the schema
// already checked the type, the options and the props.
function toItemField(field: JsonItemField): FormField<FieldValues> | never {
  return without({
    type: field.type,
    name: field.name,
    label: field.label,
    placeholder: field.placeholder,
    helperText: field.helperText,
    subLabel: field.subLabel,
    tooltip: field.tooltip,
    required: isRequired(field) || undefined,
    sensitive: field.sensitive,
    defaultValue: field.defaultValue,
    ...typeSpecific(field),
  }) as unknown as FormField<FieldValues>;
}

function toLeaf(field: JsonLeafField): FormField<FieldValues> {
  return without({
    ...(toItemField(field) as object),
    visibleIf: toRule(field.visibleIf),
    disabledIf: toRule(field.disabledIf),
    clearOnHidden: field.clearOnHidden,
    resetOnChange: field.resetOnChange,
  }) as unknown as FormField<FieldValues>;
}

function toRepeat(field: JsonRepeatField): FormField<FieldValues> {
  const minRule = field.rules?.find((item) => item.rule === 'minItems');
  const maxRule = field.rules?.find((item) => item.rule === 'maxItems');
  return without({
    type: 'repeat',
    name: field.name,
    label: field.label,
    itemLabel: field.itemLabel,
    addLabel: field.addLabel,
    minItems: minRule?.rule === 'minItems' ? minRule.value : undefined,
    maxItems: maxRule?.rule === 'maxItems' ? maxRule.value : undefined,
    fields: field.fields.map(toItemField),
    visibleIf: toRule(field.visibleIf),
    disabledIf: toRule(field.disabledIf),
  }) as unknown as FormField<FieldValues>;
}

function toField(node: JsonNode): FormField<FieldValues> {
  switch (node.type) {
    case 'row':
      return without({
        type: 'row',
        fields: node.fields.map(toLeaf),
        flex: node.flex,
        visibleIf: toRule(node.visibleIf),
        disabledIf: toRule(node.disabledIf),
      }) as unknown as FormField<FieldValues>;
    case 'group':
      return without({
        type: 'group',
        fields: node.fields.map(toField),
        visibleIf: toRule(node.visibleIf),
        disabledIf: toRule(node.disabledIf),
      }) as unknown as FormField<FieldValues>;
    case 'repeat':
      return toRepeat(node);
    default:
      return toLeaf(node);
  }
}

/**
 * Validates an untrusted document (see `parseFormJson`) and converts it to the typed config the
 * builders take, plus a Zod schema from its rules. Code-only features (functions such as
 * `calculatedValue`, `asyncValidate` and `custom` render) are not part of the format.
 */
export function fromJson(input: unknown): FromJsonResult {
  try {
    return convert(input);
  } catch {
    // Never crash the screen or log the document: an unexpected failure is a refused document.
    return { success: false, issues: ['the document could not be converted'] };
  }
}

function convert(input: unknown): FromJsonResult {
  const parsed = parseFormJson(input);
  if (!parsed.success) {
    return parsed;
  }
  const { kind, document } = parsed.data;
  const draft = document.draft === true ? { key: `json.${document.id}` } : undefined;
  if (kind === 'form') {
    return {
      success: true,
      form: {
        kind,
        id: document.id,
        fields: document.fields.map(toField),
        schema: buildZodSchema(collectJsonFields(document.fields)),
        draft,
      },
    };
  }
  const steps: StepConfig<FieldValues>[] = document.steps.map((step) =>
    without({
      id: step.id,
      title: step.title,
      canGoBack: step.canGoBack,
      visibleIf: toRule(step.visibleIf),
      fields: step.fields.map(toField),
    }),
  );
  return {
    success: true,
    form: {
      kind,
      id: document.id,
      steps,
      schema: buildZodSchema(collectJsonFields(document.steps.flatMap((step) => step.fields))),
      review: document.review === true,
      draft,
    },
  };
}
