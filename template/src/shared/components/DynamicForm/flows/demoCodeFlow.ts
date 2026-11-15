import { z } from 'zod';

import type {
  FormField,
  StepConfig,
} from '@shared/components/DynamicForm/components/FieldRegistry';
import { defineFlow } from '@shared/components/DynamicForm/utils/fromJson';
import { VALIDATION_MESSAGES as M } from '@shared/components/DynamicForm/utils/messages';

/**
 * Demo flow written as a typed code config. It uses most behaviors: conditions, a calculated
 * value, `resetOnChange`, mocked async validation, a repeat section, a sensitive field, the
 * review step and a draft.
 */

// t('formsDemo.code.steps.about', { ns: 'app', defaultValue: 'About you' })
// t('formsDemo.code.steps.work', { ns: 'app', defaultValue: 'Work' })
// t('formsDemo.code.steps.order', { ns: 'app', defaultValue: 'Order' })
// t('formsDemo.code.steps.family', { ns: 'app', defaultValue: 'Family' })
// t('formsDemo.code.fullName', { ns: 'app', defaultValue: 'Full name' })
// t('formsDemo.code.email', { ns: 'app', defaultValue: 'Email' })
// t('formsDemo.code.username', { ns: 'app' })
// t('formsDemo.code.password', { ns: 'app', defaultValue: 'Password' })
// t('formsDemo.code.hasCompany', { ns: 'app', defaultValue: 'I work for a company' })
// t('formsDemo.code.companyName', { ns: 'app', defaultValue: 'Company name' })
// t('formsDemo.code.country', { ns: 'app', defaultValue: 'Country' })
// t('formsDemo.code.city', { ns: 'app', defaultValue: 'City' })
// t('formsDemo.code.quantity', { ns: 'app', defaultValue: 'Quantity' })
// t('formsDemo.code.price', { ns: 'app', defaultValue: 'Unit price' })
// t('formsDemo.code.total', { ns: 'app', defaultValue: 'Total (calculated)' })
// t('formsDemo.code.dependants', { ns: 'app', defaultValue: 'Dependants' })
// t('formsDemo.code.dependantName', { ns: 'app', defaultValue: 'Name' })
// t('formsDemo.code.dependantItem', { ns: 'app', defaultValue: 'Dependant' })
// t('formsDemo.code.addDependant', { ns: 'app', defaultValue: 'Add dependant' })
// t('formsDemo.code.countries.eg', { ns: 'app', defaultValue: 'Egypt' })
// t('formsDemo.code.countries.sa', { ns: 'app', defaultValue: 'Saudi Arabia' })
// t('formsDemo.code.cities.cairo', { ns: 'app', defaultValue: 'Cairo' })
// t('formsDemo.code.cities.giza', { ns: 'app', defaultValue: 'Giza' })
// t('formsDemo.code.cities.riyadh', { ns: 'app', defaultValue: 'Riyadh' })
// t('formsDemo.code.cities.jeddah', { ns: 'app', defaultValue: 'Jeddah' })
// t('formsDemo.code.usernameTaken', { ns: 'app', defaultValue: 'This username is taken.' })
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
      resolve(value === 'taken' ? 'app:formsDemo.code.usernameTaken' : undefined);
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
  { type: 'text', name: 'fullName', label: 'app:formsDemo.code.fullName', required: true },
  {
    type: 'text',
    name: 'email',
    label: 'app:formsDemo.code.email',
    required: true,
    props: { keyboardType: 'email-address', autoCapitalize: 'none' },
    transform: (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  },
  {
    type: 'text',
    name: 'username',
    label: 'app:formsDemo.code.username',
    required: true,
    props: { autoCapitalize: 'none' },
    asyncValidate: checkUsername,
    asyncValidateDebounceMs: ASYNC_DEBOUNCE_MS,
  },
  {
    type: 'text',
    name: 'password',
    label: 'app:formsDemo.code.password',
    required: true,
    props: { secureTextEntry: true },
  },
];

const workFields: FormField<DemoValues>[] = [
  { type: 'switch', name: 'hasCompany', label: 'app:formsDemo.code.hasCompany' },
  {
    type: 'text',
    name: 'companyName',
    label: 'app:formsDemo.code.companyName',
    required: true,
    visibleIf: (values) => values.hasCompany,
    clearOnHidden: true,
  },
  {
    type: 'select',
    name: 'country',
    label: 'app:formsDemo.code.country',
    required: true,
    options: [
      { value: 'eg', label: 'app:formsDemo.code.countries.eg' },
      { value: 'sa', label: 'app:formsDemo.code.countries.sa' },
    ],
    resetOnChange: ['city'],
  },
  {
    type: 'select',
    name: 'city',
    label: 'app:formsDemo.code.city',
    required: true,
    options: [
      { value: 'cairo', label: 'app:formsDemo.code.cities.cairo' },
      { value: 'giza', label: 'app:formsDemo.code.cities.giza' },
      { value: 'riyadh', label: 'app:formsDemo.code.cities.riyadh' },
      { value: 'jeddah', label: 'app:formsDemo.code.cities.jeddah' },
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
        label: 'app:formsDemo.code.quantity',
        defaultValue: 1,
        props: { min: 1 },
      },
      {
        type: 'number',
        name: 'price',
        label: 'app:formsDemo.code.price',
        defaultValue: 0,
        props: { min: 0 },
      },
    ],
  },
  {
    type: 'number',
    name: 'total',
    label: 'app:formsDemo.code.total',
    defaultValue: 0,
    calculatedValue: (values) => values.quantity * values.price,
  },
];

const familyFields: FormField<DemoValues>[] = [
  {
    type: 'repeat',
    name: 'dependants',
    label: 'app:formsDemo.code.dependants',
    itemLabel: 'app:formsDemo.code.dependantItem',
    addLabel: 'app:formsDemo.code.addDependant',
    maxItems: MAX_DEPENDANTS,
    fields: [
      { type: 'text', name: 'name', label: 'app:formsDemo.code.dependantName', required: true },
    ],
  },
];

const steps: StepConfig<DemoValues>[] = [
  { id: 'about', title: 'app:formsDemo.code.steps.about', fields: aboutFields },
  { id: 'work', title: 'app:formsDemo.code.steps.work', fields: workFields },
  { id: 'order', title: 'app:formsDemo.code.steps.order', fields: orderFields },
  { id: 'family', title: 'app:formsDemo.code.steps.family', fields: familyFields },
];

export const demoCodeFlow = defineFlow<DemoValues>({
  id: 'demo-code',
  steps,
  schema: demoSchema,
  review: true,
  draft: { key: 'demo-code' },
});
