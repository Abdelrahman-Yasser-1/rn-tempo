import { useController } from 'react-hook-form';
import type { FieldPath, FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { toKey } from '@services/i18n/keys';
import { Box } from '@shared/components/Box';
import { FieldMessage } from '@shared/components/FieldMessage';
import { Switch } from '@shared/components/Switch';

import { styles } from './styles';
import type { FormSwitchProps } from './types';

/** `Switch` bound to react-hook-form (a boolean). The validation error shows below it. */
export function FormSwitch<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ name, control, helperText, ...rest }: FormSwitchProps<TFieldValues, TName>) {
  const { t } = useTranslation('validation');
  const {
    field,
    fieldState: { error },
  } = useController({ name, control });
  const errorText = error?.message ? t(toKey(error.message)) : undefined;
  const isInvalid = errorText !== undefined;
  const message = errorText ?? helperText;
  const messageKind = isInvalid ? 'error' : 'helper';

  return (
    <Box style={styles.root}>
      <Switch {...rest} value={field.value === true} onValueChange={field.onChange} />
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
