import { useTranslation } from 'react-i18next';
import { TextInput } from 'react-native';
import type { TextInputInstance } from 'react-native';

import { Box } from '../Box';
import { Text } from '../Text';

import { styles } from './styles';
import type { OtpInputProps } from './types';
import { DEFAULT_LENGTH, useOtpInput } from './useOtpInput';

/** Fixed-length one-time-code input: auto-advance, backspace-to-previous and paste/autofill. */
export function OtpInput({
  value,
  onChangeText,
  onComplete,
  length = DEFAULT_LENGTH,
  autoFocus: isAutoFocus = false,
  disabled: isDisabled = false,
  errorText,
  testID,
}: OtpInputProps) {
  const { t } = useTranslation();
  const {
    cells,
    focusedIndex,
    setCellRef,
    onCellChange,
    onCellBackspace,
    onCellFocus,
    onCellBlur,
  } = useOtpInput({ value, onChangeText, onComplete, length });
  const isInvalid = errorText !== undefined && errorText !== '';

  return (
    <Box style={styles.root}>
      <Box style={styles.row} testID={testID}>
        {cells.map((index) => (
          <OTPCell
            key={`cell-${String(index)}`}
            index={index}
            total={length}
            digit={value[index] ?? ''}
            isFocused={focusedIndex === index}
            isDisabled={isDisabled}
            isInvalid={isInvalid}
            isAutoFocus={isAutoFocus && index === 0}
            testID={testID ? `${testID}.${String(index)}` : undefined}
            label={t('otp.digit', { index: index + 1, total: length })}
            inputRef={(node) => {
              setCellRef(index, node);
            }}
            onChangeText={(text) => {
              onCellChange(index, text);
            }}
            onBackspace={() => {
              onCellBackspace(index);
            }}
            onFocus={() => {
              onCellFocus(index);
            }}
            onBlur={() => {
              onCellBlur(index);
            }}
          />
        ))}
      </Box>
      {isInvalid && (
        <Text
          testID={testID ? `${testID}.error` : undefined}
          variant="caption"
          color="error"
          align="center"
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {errorText}
        </Text>
      )}
    </Box>
  );
}

type OTPCellProps = Readonly<{
  index: number;
  total: number;
  digit: string;
  label: string;
  isFocused: boolean;
  isDisabled: boolean;
  isInvalid: boolean;
  isAutoFocus: boolean;
  testID?: string;
  inputRef: (node: TextInputInstance | null) => void;
  onChangeText: (text: string) => void;
  onBackspace: () => void;
  onFocus: () => void;
  onBlur: () => void;
}>;

function OTPCell({
  digit,
  label,
  isFocused,
  isDisabled,
  isInvalid,
  isAutoFocus,
  testID,
  inputRef,
  onChangeText,
  onBackspace,
  onFocus,
  onBlur,
}: OTPCellProps) {
  const state = { disabled: isDisabled };
  styles.useVariants({ focused: isFocused, invalid: isInvalid, disabled: isDisabled });

  return (
    <TextInput
      ref={inputRef}
      testID={testID}
      style={styles.cell}
      value={digit}
      accessibilityLabel={label}
      accessibilityState={state}
      editable={!isDisabled}
      autoFocus={isAutoFocus}
      keyboardType="number-pad"
      inputMode="numeric"
      textContentType="oneTimeCode"
      autoComplete="sms-otp"
      selectTextOnFocus
      caretHidden
      maxFontSizeMultiplier={1.5}
      onChangeText={onChangeText}
      onKeyPress={(event) => {
        if (event.nativeEvent.key === 'Backspace') {
          onBackspace();
        }
      }}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}
