import type { ParseKeys } from 'i18next';
import { useController } from 'react-hook-form';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Box } from '../Box';
import { Checkbox } from '../Checkbox';
import { FieldMessage } from '../FieldMessage';

import { styles } from './styles';
import type { FormCheckboxProps } from './types';

/** `Checkbox` bound to react-hook-form (a boolean). The validation error shows below it. */
export function FormCheckbox<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ name, control, helperText, ...rest }: FormCheckboxProps<TFieldValues, TName>) {
  const { t } = useTranslation('validation');
  const {
    field,
    fieldState: { error },
  } = useController({ name, control });
  const errorText = error?.message ? t(error.message as ParseKeys<'validation'>) : undefined;
  const isInvalid = errorText !== undefined;
  const message = errorText ?? helperText;
  const messageKind = isInvalid ? 'error' : 'helper';

  return (
    <Box style={styles.root}>
      <Checkbox {...rest} checked={field.value === true} onChange={field.onChange} />
      {message !== undefined && message !== '' && (
        <FieldMessage
          testID={rest.testID ? `${rest.testID}.${messageKind}` : undefined}
          variant={messageKind}
          message={message}
        />
      )}
    </Box>
  );
}
