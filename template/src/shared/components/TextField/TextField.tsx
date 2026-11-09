import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

import { Box } from '@shared/components/Box';
import { FieldLabel } from '@shared/components/FieldLabel';
import { FieldMessage } from '@shared/components/FieldMessage';
import { IconButton } from '@shared/components/IconButton';
import { Text } from '@shared/components/Text';

import { styles } from './styles';
import type { TextFieldProps } from './types';
import { useTextField } from './useTextField';

const DEFAULT_MULTILINE_LINES = 4;

type PasswordToggleProps = Readonly<{
  isRevealed: boolean;
  isDisabled: boolean;
  onToggle: () => void;
  testID?: string;
}>;

function PasswordToggle({ isRevealed, isDisabled, onToggle, testID }: PasswordToggleProps) {
  const { t } = useTranslation();

  return (
    <IconButton
      testID={testID}
      icon={isRevealed ? 'eye-off' : 'eye'}
      size="sm"
      disabled={isDisabled}
      accessibilityLabel={
        isRevealed ? t(($) => $.a11y.hidePassword) : t(($) => $.a11y.showPassword)
      }
      accessibilityState={{ checked: isRevealed }}
      onPress={onToggle}
    />
  );
}

type AffixProps = Readonly<{ content: ReactNode; testID?: string }>;

/** Nothing for an empty slot; a string is styled as secondary text, any other node as given. */
function Affix({ content, testID }: AffixProps) {
  if (content === undefined || content === null || content === '') {
    return null;
  }
  return typeof content === 'string' ? (
    <Text testID={testID} color="textSecondary">
      {content}
    </Text>
  ) : (
    content
  );
}

type AdornmentProps = Readonly<{ content: ReactNode }>;

/** An edge slot (icon, button); nothing when empty. */
function Adornment({ content }: AdornmentProps) {
  return content === undefined || content === null ? null : (
    <Box style={styles.adornment}>{content}</Box>
  );
}

/**
 * Labelled text input with helper and error text, start/end adornments, in-field prefix and
 * suffix, a read-only style and, for `secureTextEntry`, a show/hide toggle.
 */
export function TextField({
  ref,
  label,
  required: isRequired,
  subLabel,
  tooltip,
  helperText,
  errorText,
  disabled: isDisabled = false,
  readOnly: isReadOnly = false,
  left,
  right,
  prefix,
  suffix,
  secureTextEntry: isSecure = false,
  multiline: isMultiline = false,
  numberOfLines,
  accessibilityLabel,
  accessibilityState,
  onFocus,
  onBlur,
  testID,
  ...rest
}: TextFieldProps) {
  const { theme } = useUnistyles();
  const {
    isFocused,
    isRevealed,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onToggleReveal,
  } = useTextField({ onFocus, onBlur });
  const isInvalid = errorText !== undefined && errorText !== '';
  styles.useVariants({
    multiline: isMultiline,
    focused: isFocused && !isReadOnly,
    invalid: isInvalid,
    readOnly: isReadOnly,
    disabled: isDisabled,
  });

  const state = { ...accessibilityState, disabled: isDisabled };
  const message = isInvalid ? errorText : helperText;
  const endAdornment = isSecure ? (
    <PasswordToggle
      testID={testID ? `${testID}.toggle` : undefined}
      isRevealed={isRevealed}
      isDisabled={isDisabled}
      onToggle={onToggleReveal}
    />
  ) : (
    right
  );
  const messageKind = isInvalid ? 'error' : 'helper';

  return (
    <Box style={styles.root}>
      {label !== undefined && (
        <FieldLabel
          testID={testID ? `${testID}.label` : undefined}
          label={label}
          required={isRequired}
          subLabel={subLabel}
          tooltip={tooltip}
        />
      )}
      <Box style={styles.container}>
        <Adornment content={left} />
        <Affix content={prefix} testID={testID ? `${testID}.prefix` : undefined} />
        <TextInput
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityState={state}
          placeholderTextColor={theme.colors.textSecondary}
          selectionColor={theme.colors.primary}
          maxFontSizeMultiplier={1.5}
          {...rest}
          ref={ref}
          testID={testID}
          multiline={isMultiline}
          numberOfLines={numberOfLines}
          editable={!isDisabled && !isReadOnly}
          readOnly={isReadOnly || undefined}
          secureTextEntry={isSecure && !isRevealed}
          style={[
            styles.input,
            isMultiline && styles.multilineHeight(numberOfLines ?? DEFAULT_MULTILINE_LINES),
          ]}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        <Affix content={suffix} testID={testID ? `${testID}.suffix` : undefined} />
        <Adornment content={endAdornment} />
      </Box>
      {message !== undefined && message !== '' && (
        <FieldMessage
          testID={testID ? `${testID}.${messageKind}` : undefined}
          variant={messageKind}
          message={message}
        />
      )}
    </Box>
  );
}
