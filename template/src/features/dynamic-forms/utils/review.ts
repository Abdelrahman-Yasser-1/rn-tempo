import type { FieldValues } from 'react-hook-form';
import { get } from 'react-hook-form';

import type { FormField, FormOption, FormText } from '@features/dynamic-forms/types';
import { isSensitive, walkFields } from '@features/dynamic-forms/utils/fieldTree';
import {
  formatFullDate,
  formatMonthYear,
  formatNumber,
  isValidISODate,
  parseYearMonth,
} from '@shared/utils';

export type ReviewItem = Readonly<{ key: string; label: string; value: string }>;

export type ReviewContext = Readonly<{
  resolve: (text: FormText | undefined) => string | undefined;
  locale: string;
  yes: string;
  no: string;
  /** Shown for a field the user left empty. */
  empty: string;
  /** Heading of a repeat item: its label and number. */
  itemHeading: (label: string | undefined, index: number) => string;
}>;

type Reviewable = Readonly<{
  type: string;
  name: string;
  label?: FormText;
  options?: readonly FormOption[];
  props?: unknown;
  sensitive?: boolean;
}>;

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function optionLabel(field: Reviewable, value: unknown, ctx: ReviewContext): string {
  const text = typeof value === 'string' ? value : '';
  const option = field.options?.find((item) => item.value === text);
  return option ? (ctx.resolve(option.label) ?? text) : text;
}

function slotLabel(field: Reviewable, value: unknown): string {
  const text = typeof value === 'string' ? value : '';
  const props = field.props as { slots?: readonly { value: string; label?: string }[] } | undefined;
  return props?.slots?.find((slot) => slot.value === text)?.label ?? text;
}

function fileName(value: unknown): string {
  return typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string'
    ? value.name
    : '';
}

function locationText(value: unknown): string {
  if (typeof value !== 'object' || value === null) {
    return '';
  }
  const location = value as { address?: unknown; latitude?: unknown; longitude?: unknown };
  if (typeof location.address === 'string' && location.address !== '') {
    return location.address;
  }
  return typeof location.latitude === 'number' && typeof location.longitude === 'number'
    ? `${String(location.latitude)}, ${String(location.longitude)}`
    : '';
}

function formatByType(field: Reviewable, value: unknown, ctx: ReviewContext): string {
  switch (field.type) {
    case 'select':
    case 'radioGroup':
      return optionLabel(field, value, ctx);
    case 'multiSelect':
      return Array.isArray(value)
        ? value.map((item) => optionLabel(field, item, ctx)).join(', ')
        : '';
    case 'timeSlot':
      return slotLabel(field, value);
    case 'date':
      return typeof value === 'string' && isValidISODate(value)
        ? formatFullDate(value, ctx.locale)
        : '';
    case 'monthYear': {
      if (typeof value !== 'string') {
        return '';
      }
      const { year, month } = parseYearMonth(value);
      return formatMonthYear(ctx.locale, year, month);
    }
    case 'number':
    case 'slider':
      return typeof value === 'number' ? formatNumber(value, ctx.locale) : '';
    case 'file':
      return fileName(value);
    case 'multiFile':
      return Array.isArray(value) ? value.map(fileName).join(', ') : '';
    case 'map':
      return locationText(value);
    default:
      return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  }
}

/** The text a value shows in the review: labels for options, localized dates, yes or no. */
export function formatReviewValue(field: Reviewable, value: unknown, ctx: ReviewContext): string {
  if (field.type === 'checkbox' || field.type === 'switch') {
    return value === true ? ctx.yes : ctx.no;
  }
  if (isEmpty(value)) {
    return ctx.empty;
  }
  const text = formatByType(field, value, ctx);
  return text === '' ? ctx.empty : text;
}

/**
 * The review rows of a list of fields: visible fields only, sensitive ones left out. A repeat
 * section gives one row per item, with its fields on separate lines.
 */
export function buildReviewItems<T extends FieldValues>(
  fields: readonly FormField<T>[],
  values: T,
  ctx: ReviewContext,
): ReviewItem[] {
  return walkFields(fields, values)
    .filter(({ field, isVisible }) => isVisible && !isSensitive(field))
    .flatMap(({ field }): ReviewItem[] => {
      const value: unknown = get(values, field.name);
      if (field.type !== 'repeat') {
        return [
          {
            key: field.name,
            label: ctx.resolve(field.label) ?? field.name,
            value: formatReviewValue(field, value, ctx),
          },
        ];
      }
      const items: unknown[] = Array.isArray(value) ? value : [];
      const itemLabel = ctx.resolve(field.itemLabel);
      return items.map((item, index) => ({
        key: `${field.name}.${String(index)}`,
        label: ctx.itemHeading(itemLabel, index + 1),
        value: field.fields
          .filter((child) => !isSensitive(child))
          .map(
            (child) =>
              `${ctx.resolve(child.label) ?? child.name}: ${formatReviewValue(child, get(item, child.name), ctx)}`,
          )
          .join('\n'),
      }));
    });
}
