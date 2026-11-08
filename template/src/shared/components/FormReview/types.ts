import type { DescriptionItem } from '@shared/components/DescriptionList';

export type FormReviewSection = Readonly<{
  key: string;
  title: string;
  /** Label/value rows of the section. */
  items: readonly DescriptionItem[];
}>;

export type FormReviewProps = Readonly<{
  sections: readonly FormReviewSection[];
  /** Shows an edit link on each section; called with the section key. */
  onEdit?: (sectionKey: string) => void;
  layout?: 'horizontal' | 'vertical';
  /** Sections use `${testID}.${key}`, their edit links `${testID}.${key}.edit`. */
  testID?: string;
}>;
