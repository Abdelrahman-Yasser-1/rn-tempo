import type { FieldValues } from 'react-hook-form';

import type { BuiltForm } from '@features/dynamic-forms/utils/fromJson';

export type FormFlowProps = Readonly<{
  /** A code flow (`defineFlow`) or a JSON document turned into a flow (`fromJson`). */
  flow: BuiltForm;
  onSubmit: (values: FieldValues) => void | Promise<void>;
  testID?: string;
}>;
