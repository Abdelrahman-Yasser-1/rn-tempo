import type { FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import type { StepConfig } from '@features/dynamic-forms/components/MultiStepFormBuilder/types';
import { useFormText } from '@features/dynamic-forms/hooks/useFormText';
import { buildReviewItems } from '@features/dynamic-forms/utils/review';
import type { ReviewContext } from '@features/dynamic-forms/utils/review';
import { FormReview, Text } from '@shared/components';
import type { FormReviewSection } from '@shared/components';

import { styles } from './styles';

type ReviewStepProps<T extends FieldValues> = Readonly<{
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
}: ReviewStepProps<T>) {
  const { t, i18n } = useTranslation('forms');
  const resolve = useFormText();
  const context: ReviewContext = {
    resolve,
    locale: i18n.language,
    yes: t('review.yes'),
    no: t('review.no'),
    empty: t('review.empty'),
    itemHeading: (label, index) =>
      t('repeat.itemHeading', { label: label ?? t('repeat.itemLabel'), index }),
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
            title: resolve(step.title) ?? t('review.stepFallback', { index: index + 1 }),
            items: items.map(({ key, label, value }) => ({ key, label, value })),
          },
        ];
  });

  return (
    <View style={styles.root} testID={testID}>
      {sections.length === 0 ? (
        <Text color="textSecondary">{t('review.nothing')}</Text>
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
