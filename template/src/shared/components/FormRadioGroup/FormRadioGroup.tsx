import type { ParseKeys } from 'i18next';
import { useController } from 'react-hook-form';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Box } from '@shared/components/Box';
import { FieldLabel } from '@shared/components/FieldLabel';
import { FieldMessage } from '@shared/components/FieldMessage';
import { RadioGroup } from '@shared/components/RadioGroup';

import { styles } from './styles';
import type { FormRadioGroupProps } from './types';

/** `RadioGroup` bound to react-hook-form (the selected value string), with a field label. The validation error shows below it. */
export function FormRadioGroup<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  name,
  control,
  helperText,
  label,
  required: isRequired,
  subLabel,
  tooltip,
  ...rest
}: FormRadioGroupProps<TFieldValues, TName>) {
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
      {label !== undefined && (
        <FieldLabel
          testID={rest.testID ? `${rest.testID}.label` : undefined}
          label={label}
          required={isRequired}
          subLabel={subLabel}
          tooltip={tooltip}
        />
      )}
      <RadioGroup
        accessibilityLabel={label}
        {...rest}
        value={typeof field.value === 'string' ? field.value : undefined}
        onChange={field.onChange}
      />
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
