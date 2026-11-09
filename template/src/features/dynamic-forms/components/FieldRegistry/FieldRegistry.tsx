// THIS FILE CHANGES PER PROJECT (together with types.ts): it ties each field type to the
// component that renders it. A renderer returns the `Form*` component bound to `name`; the
// builder supplies the translated texts and the required, disabled and testID state.
import {
  FormCheckbox,
  FormDatePicker,
  FormFilePicker, // @tempo-feature:file-picker
  FormMapPicker, // @tempo-feature:maps
  FormMonthYearPicker,
  FormMultiFilePicker, // @tempo-feature:file-picker
  FormMultiSelect,
  FormNumberInput,
  FormOtpInput,
  FormPhoneInput,
  FormRadioGroup,
  FormSelect,
  FormSlider,
  FormSwitch,
  FormTextArea,
  FormTextField,
  FormTimePicker,
  FormTimeSlot,
  Radio,
} from '@shared/components';

import type {
  FieldRenderArgs,
  FieldRendererMap,
  FieldTypeName,
  FormOption,
  FormText,
} from './types';

type Resolve = (text: FormText | undefined) => string | undefined;

function resolveOptions(options: readonly FormOption[], resolve: Resolve) {
  return options.map((option) => ({
    value: option.value,
    label: resolve(option.label) ?? option.value,
    disabled: option.disabled,
  }));
}

export const fieldRenderers: FieldRendererMap = {
  text: ({ name, config, texts, isRequired, isDisabled, testID }) => (
    <FormTextField
      {...config.props}
      {...texts}
      name={name}
      required={isRequired}
      disabled={isDisabled}
      testID={testID}
    />
  ),
  textArea: ({ name, config, texts, isRequired, isDisabled, testID }) => (
    <FormTextArea
      {...config.props}
      {...texts}
      name={name}
      required={isRequired}
      disabled={isDisabled}
      testID={testID}
    />
  ),
  number: ({ name, config, texts, isRequired, isDisabled, testID }) => (
    <FormNumberInput
      {...config.props}
      label={texts.label}
      subLabel={texts.subLabel}
      tooltip={texts.tooltip}
      helperText={texts.helperText}
      name={name}
      required={isRequired}
      disabled={isDisabled}
      testID={testID}
    />
  ),
  select: ({ name, config, texts, isRequired, isDisabled, testID, resolve }) => (
    <FormSelect
      {...config.props}
      {...texts}
      options={resolveOptions(config.options, resolve)}
      name={name}
      required={isRequired}
      disabled={isDisabled}
      testID={testID}
    />
  ),
  multiSelect: ({ name, config, texts, isRequired, isDisabled, testID, resolve }) => (
    <FormMultiSelect
      {...config.props}
      {...texts}
      options={resolveOptions(config.options, resolve)}
      name={name}
      required={isRequired}
      disabled={isDisabled}
      testID={testID}
    />
  ),
  radioGroup: ({ name, config, texts, isRequired, isDisabled, testID, resolve }) => (
    <FormRadioGroup
      {...config.props}
      label={texts.label}
      subLabel={texts.subLabel}
      tooltip={texts.tooltip}
      helperText={texts.helperText}
      name={name}
      required={isRequired}
      disabled={isDisabled}
      testID={testID}
    >
      {resolveOptions(config.options, resolve).map((option) => (
        <Radio
          key={option.value}
          value={option.value}
          label={option.label}
          disabled={option.disabled}
          testID={testID ? `${testID}.${option.value}` : undefined}
        />
      ))}
    </FormRadioGroup>
  ),
  checkbox: ({ name, config, texts, isDisabled, testID }) => (
    <FormCheckbox
      {...config.props}
      label={texts.label}
      helperText={texts.helperText}
      name={name}
      disabled={isDisabled}
      testID={testID}
    />
  ),
  switch: ({ name, config, texts, isDisabled, testID }) => (
    <FormSwitch
      {...config.props}
      label={texts.label}
      helperText={texts.helperText}
      name={name}
      disabled={isDisabled}
      testID={testID}
    />
  ),
  slider: ({ name, config, texts, isRequired, isDisabled, testID }) => (
    <FormSlider
      {...config.props}
      label={texts.label}
      subLabel={texts.subLabel}
      tooltip={texts.tooltip}
      helperText={texts.helperText}
      name={name}
      required={isRequired}
      disabled={isDisabled}
      testID={testID}
    />
  ),
  date: ({ name, config, texts, isRequired, isDisabled, testID }) => (
    <FormDatePicker
      {...config.props}
      {...texts}
      name={name}
      required={isRequired}
      disabled={isDisabled}
      testID={testID}
    />
  ),
  time: ({ name, config, texts, isRequired, isDisabled, testID }) => (
    <FormTimePicker
      {...config.props}
      {...texts}
      name={name}
      required={isRequired}
      disabled={isDisabled}
      testID={testID}
    />
  ),
  monthYear: ({ name, config, texts, isRequired, isDisabled, testID }) => (
    <FormMonthYearPicker
      {...config.props}
      {...texts}
      name={name}
      required={isRequired}
      disabled={isDisabled}
      testID={testID}
    />
  ),
  timeSlot: ({ name, config, texts, isRequired, isDisabled, testID }) => (
    <FormTimeSlot
      {...config.props}
      {...texts}
      name={name}
      required={isRequired}
      disabled={isDisabled}
      testID={testID}
    />
  ),
  otp: ({ name, config, isDisabled, testID }) => (
    <FormOtpInput {...config.props} name={name} disabled={isDisabled} testID={testID} />
  ),
  phone: ({ name, config, texts, isRequired, isDisabled, testID }) => (
    <FormPhoneInput
      {...config.props}
      {...texts}
      name={name}
      required={isRequired}
      disabled={isDisabled}
      testID={testID}
    />
  ),
  // @tempo-feature:file-picker:start
  file: ({ name, config, texts, isRequired, isDisabled, testID }) => (
    <FormFilePicker
      {...config.props}
      {...texts}
      name={name}
      required={isRequired}
      disabled={isDisabled}
      testID={testID}
    />
  ),
  multiFile: ({ name, config, texts, isRequired, isDisabled, testID }) => (
    <FormMultiFilePicker
      {...config.props}
      {...texts}
      name={name}
      required={isRequired}
      disabled={isDisabled}
      testID={testID}
    />
  ),
  // @tempo-feature:file-picker:end
  // @tempo-feature:maps:start
  map: ({ name, config, texts, isRequired, isDisabled, testID }) => (
    <FormMapPicker
      {...config.props}
      {...texts}
      name={name}
      required={isRequired}
      disabled={isDisabled}
      testID={testID}
    />
  ),
  // @tempo-feature:maps:end
};

/** Renders one field of any type through its registered renderer. */
export function renderField<K extends FieldTypeName>(type: K, args: FieldRenderArgs<K>) {
  return fieldRenderers[type](args);
}
