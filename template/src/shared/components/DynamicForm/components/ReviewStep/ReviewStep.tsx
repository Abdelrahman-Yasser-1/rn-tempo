import type { FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useFormText } from '@shared/components/DynamicForm/hooks/useFormText';
import type { StepConfig } from '@shared/components/DynamicForm/types';
import { buildReviewItems } from '@shared/components/DynamicForm/utils/review';
import type { ReviewContext } from '@shared/components/DynamicForm/utils/review';
import type { FormReviewSection } from '@shared/components/FormReview';
import { FormReview } from '@shared/components/FormReview';
import { Text } from '@shared/components/Text';

import { styles } from './styles';

type FormReviewStepProps<T extends FieldValues> = Readonly<{
  steps: readonly StepConfig<T>[];
  values: T;
  /** Called with the index (in `steps`) of the step whose Edit link was pressed. */
  onEdit: (stepIndex: number) => void;
  testID?: string;
}>;

/**
 * The last step of a form with `review`: a read-only summary built from the field config, one
 * card per visible step with an Edit link. Hidden and sensitive fields are left out.
 */
export function ReviewStep<T extends FieldValues>({
  steps,
  values,
  onEdit,
  testID = 'dynamic-form.review',
}: FormReviewStepProps<T>) {
  const { t, i18n } = useTranslation();
  const resolve = useFormText();
  const context: ReviewContext = {
    resolve,
    locale: i18n.language,
    yes: t('formBuilder.review.yes'),
    no: t('formBuilder.review.no'),
    empty: t('formBuilder.review.empty'),
    itemHeading: (label, index) =>
      t('formBuilder.repeat.itemHeading', {
        label: label ?? t('formBuilder.repeat.itemLabel'),
        index,
      }),
  };

  const sections: FormReviewSection[] = steps.flatMap((step, index) => {
    if (!(step.visibleIf?.(values) ?? true)) {
      return [];
    }
    const items = buildReviewItems(step.fields, values, context);
    return items.length === 0
      ? []
      : [
          {
            key: String(index),
            title:
              resolve(step.title) ?? t('formBuilder.review.stepFallback', { index: index + 1 }),
            items: items.map(({ key, label, value }) => ({ key, label, value })),
          },
        ];
  });

  return (
    <View style={styles.root} testID={testID}>
      {sections.length === 0 ? (
        <Text color="textSecondary">{t('formBuilder.review.nothing')}</Text>
      ) : (
        <FormReview
          sections={sections}
          layout="vertical"
          onEdit={(key) => {
            onEdit(Number(key));
          }}
          testID={`${testID}.sections`}
        />
      )}
    </View>
  );
}
