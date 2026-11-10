import { z } from 'zod';

import type { StepConfig } from '@features/dynamic-forms/components/MultiStepFormBuilder/types';
import type { FormField } from '@features/dynamic-forms/types';
import { defineFlow } from '@features/dynamic-forms/utils/defineFlow';
import { VALIDATION_MESSAGES as M } from '@features/dynamic-forms/utils/messages';

/**
 * Demo flow written as a typed code config. It uses most behaviors: conditions, a calculated
 * value, `resetOnChange`, mocked async validation, a repeat section, a sensitive field, the
 * review step and a draft.
 */

// t('demo.code.steps.about', { ns: 'forms', defaultValue: 'About you' })
// t('demo.code.steps.work', { ns: 'forms', defaultValue: 'Work' })
// t('demo.code.steps.order', { ns: 'forms', defaultValue: 'Order' })
// t('demo.code.steps.family', { ns: 'forms', defaultValue: 'Family' })
// t('demo.code.fullName', { ns: 'forms', defaultValue: 'Full name' })
// t('demo.code.email', { ns: 'forms', defaultValue: 'Email' })
// t('demo.code.username', { ns: 'forms' })
// t('demo.code.password', { ns: 'forms', defaultValue: 'Password' })
// t('demo.code.hasCompany', { ns: 'forms', defaultValue: 'I work for a company' })
// t('demo.code.companyName', { ns: 'forms', defaultValue: 'Company name' })
// t('demo.code.country', { ns: 'forms', defaultValue: 'Country' })
// t('demo.code.city', { ns: 'forms', defaultValue: 'City' })
// t('demo.code.quantity', { ns: 'forms', defaultValue: 'Quantity' })
// t('demo.code.price', { ns: 'forms', defaultValue: 'Unit price' })
// t('demo.code.total', { ns: 'forms', defaultValue: 'Total (calculated)' })
// t('demo.code.dependants', { ns: 'forms', defaultValue: 'Dependants' })
// t('demo.code.dependantName', { ns: 'forms', defaultValue: 'Name' })
// t('demo.code.dependantItem', { ns: 'forms', defaultValue: 'Dependant' })
// t('demo.code.addDependant', { ns: 'forms', defaultValue: 'Add dependant' })
// t('demo.code.countries.eg', { ns: 'forms', defaultValue: 'Egypt' })
// t('demo.code.countries.sa', { ns: 'forms', defaultValue: 'Saudi Arabia' })
// t('demo.code.cities.cairo', { ns: 'forms', defaultValue: 'Cairo' })
// t('demo.code.cities.giza', { ns: 'forms', defaultValue: 'Giza' })
// t('demo.code.cities.riyadh', { ns: 'forms', defaultValue: 'Riyadh' })
// t('demo.code.cities.jeddah', { ns: 'forms', defaultValue: 'Jeddah' })
// t('validation.usernameTaken', { ns: 'forms', defaultValue: 'This username is taken.' })
type DemoValues = {
  fullName: string;
  email: string;
  username: string;
  password: string;
  hasCompany: boolean;
  companyName: string;
  country: string;
  city: string;
  quantity: number;
  price: number;
  total: number;
  dependants: { name: string }[];
};

const ASYNC_DELAY_MS = 300;
const ASYNC_DEBOUNCE_MS = 400;
const MIN_PASSWORD_LENGTH = 8;
const MAX_DEPENDANTS = 3;

/** Mocked server check: the username "taken" is not available. */
function checkUsername(value: unknown): Promise<string | undefined> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(value === 'taken' ? 'forms:validation.usernameTaken' : undefined);
    }, ASYNC_DELAY_MS);
  });
}

const required = z.string(M.required).min(1, M.required);

const demoSchema = z.object({
  fullName: z.string(M.required).min(2, M.tooShort),
  email: required.pipe(z.email(M.email)),
  username: z.string(M.required).min(3, M.tooShort),
  password: z.string(M.required).min(MIN_PASSWORD_LENGTH, M.tooShort),
  hasCompany: z.boolean(),
  companyName: required,
  country: required,
  city: required,
  quantity: z.number(M.required).min(1, M.tooSmall),
  price: z.number(M.required).min(0, M.tooSmall),
  total: z.number(),
  dependants: z.array(z.object({ name: required })).max(MAX_DEPENDANTS, M.tooManyItems),
}) satisfies z.ZodType<DemoValues, Record<string, unknown>>;

const aboutFields: FormField<DemoValues>[] = [
  { type: 'text', name: 'fullName', label: 'demo.code.fullName', required: true },
  {
    type: 'text',
    name: 'email',
    label: 'demo.code.email',
    required: true,
    props: { keyboardType: 'email-address', autoCapitalize: 'none' },
    transform: (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  },
  {
    type: 'text',
    name: 'username',
    label: 'demo.code.username',
    required: true,
    props: { autoCapitalize: 'none' },
    asyncValidate: checkUsername,
    asyncValidateDebounceMs: ASYNC_DEBOUNCE_MS,
  },
  {
    type: 'text',
    name: 'password',
    label: 'demo.code.password',
    required: true,
    props: { secureTextEntry: true },
  },
];

const workFields: FormField<DemoValues>[] = [
  { type: 'switch', name: 'hasCompany', label: 'demo.code.hasCompany' },
  {
    type: 'text',
    name: 'companyName',
    label: 'demo.code.companyName',
    required: true,
    visibleIf: (values) => values.hasCompany,
    clearOnHidden: true,
  },
  {
    type: 'select',
    name: 'country',
    label: 'demo.code.country',
    required: true,
    options: [
      { value: 'eg', label: 'demo.code.countries.eg' },
      { value: 'sa', label: 'demo.code.countries.sa' },
    ],
    resetOnChange: ['city'],
  },
  {
    type: 'select',
    name: 'city',
    label: 'demo.code.city',
    required: true,
    options: [
      { value: 'cairo', label: 'demo.code.cities.cairo' },
      { value: 'giza', label: 'demo.code.cities.giza' },
      { value: 'riyadh', label: 'demo.code.cities.riyadh' },
      { value: 'jeddah', label: 'demo.code.cities.jeddah' },
    ],
    disabledIf: (values) => !values.country,
  },
];

const orderFields: FormField<DemoValues>[] = [
  {
    type: 'row',
    fields: [
      {
        type: 'number',
        name: 'quantity',
        label: 'demo.code.quantity',
        defaultValue: 1,
        props: { min: 1 },
      },
      {
        type: 'number',
        name: 'price',
        label: 'demo.code.price',
        defaultValue: 0,
        props: { min: 0 },
      },
    ],
  },
  {
    type: 'number',
    name: 'total',
    label: 'demo.code.total',
    defaultValue: 0,
    calculatedValue: (values) => values.quantity * values.price,
  },
];

const familyFields: FormField<DemoValues>[] = [
  {
    type: 'repeat',
    name: 'dependants',
    label: 'demo.code.dependants',
    itemLabel: 'demo.code.dependantItem',
    addLabel: 'demo.code.addDependant',
    maxItems: MAX_DEPENDANTS,
    fields: [{ type: 'text', name: 'name', label: 'demo.code.dependantName', required: true }],
  },
];

const steps: StepConfig<DemoValues>[] = [
  { id: 'about', title: 'demo.code.steps.about', fields: aboutFields },
  { id: 'work', title: 'demo.code.steps.work', fields: workFields },
  { id: 'order', title: 'demo.code.steps.order', fields: orderFields },
  { id: 'family', title: 'demo.code.steps.family', fields: familyFields },
];

export const demoCodeFlow = defineFlow<DemoValues>({
  id: 'demo-code',
  steps,
  schema: demoSchema,
  review: true,
  draft: { key: 'demo-code' },
});
