import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

import { Box } from '../Box';
import { IconButton } from '../IconButton';
import { Text } from '../Text';

import { styles } from './styles';
import type { TextFieldProps } from './types';

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
      accessibilityLabel={t(isRevealed ? 'a11y.hidePassword' : 'a11y.showPassword')}
      accessibilityState={{ checked: isRevealed }}
      onPress={onToggle}
    />
  );
}

/**
 * Labelled text input with helper and error text, start/end adornments and, for
 * `secureTextEntry`, a show/hide toggle.
 */
export function TextField({
  ref,
  label,
  helperText,
  errorText,
  disabled: isDisabled = false,
  left,
  right,
  secureTextEntry: isSecure = false,
  accessibilityLabel,
  accessibilityState,
  onFocus,
  onBlur,
  testID,
  ...rest
}: TextFieldProps) {
  const { theme } = useUnistyles();
  const [isFocused, setIsFocused] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const isInvalid = errorText !== undefined && errorText !== '';
  styles.useVariants({ focused: isFocused, invalid: isInvalid, disabled: isDisabled });

  const state = { ...accessibilityState, disabled: isDisabled };
  const message = isInvalid ? errorText : helperText;
  const endAdornment = isSecure ? (
    <PasswordToggle
      testID={testID ? `${testID}.toggle` : undefined}
      isRevealed={isRevealed}
      isDisabled={isDisabled}
      onToggle={() => {
        setIsRevealed((isShown) => !isShown);
      }}
    />
  ) : (
    right
  );
  const messageKind = isInvalid ? 'error' : 'helper';

  return (
    <Box style={styles.root}>
      {label !== undefined && (
        <Text testID={testID ? `${testID}.label` : undefined} variant="label" color="textSecondary">
          {label}
        </Text>
      )}
      <Box style={styles.container}>
        {left !== undefined && <Box style={styles.adornment}>{left}</Box>}
        <TextInput
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityState={state}
          placeholderTextColor={theme.colors.textSecondary}
          selectionColor={theme.colors.primary}
          maxFontSizeMultiplier={1.5}
          {...rest}
          ref={ref}
          testID={testID}
          editable={!isDisabled}
          secureTextEntry={isSecure && !isRevealed}
          style={styles.input}
          onFocus={(event) => {
            setIsFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setIsFocused(false);
            onBlur?.(event);
          }}
        />
        {endAdornment !== undefined && endAdornment !== null && (
          <Box style={styles.adornment}>{endAdornment}</Box>
        )}
      </Box>
      {message !== undefined && message !== '' && (
        <Text
          testID={testID ? `${testID}.${messageKind}` : undefined}
          variant="caption"
          color={isInvalid ? 'error' : 'textSecondary'}
          accessibilityLiveRegion={isInvalid ? 'polite' : undefined}
          accessibilityRole={isInvalid ? 'alert' : undefined}
        >
          {message}
        </Text>
      )}
    </Box>
  );
}
