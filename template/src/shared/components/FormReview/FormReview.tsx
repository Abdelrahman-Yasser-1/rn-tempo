import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Card } from '../Card';
import { DescriptionList } from '../DescriptionList';
import { Link } from '../Link';
import { Text } from '../Text';

import { styles } from './styles';
import type { FormReviewProps } from './types';

/**
 * Read-only summary of a filled-in form: one card per section with its rows and, when `onEdit`
 * is given, an edit link that names its section for screen readers.
 */
export function FormReview({ sections, onEdit, layout = 'horizontal', testID }: FormReviewProps) {
  const { t } = useTranslation();

  return (
    <View testID={testID} style={styles.root}>
      {sections.map((section) => {
        const sectionTestID = testID ? `${testID}.${section.key}` : undefined;
        return (
          <Card key={section.key} variant="outlined" testID={sectionTestID}>
            <View style={styles.header}>
              <Text
                variant="title"
                accessibilityRole="header"
                style={styles.title}
                testID={sectionTestID ? `${sectionTestID}.title` : undefined}
              >
                {section.title}
              </Text>
              {onEdit !== undefined && (
                <Link
                  accessibilityLabel={t('formReview.editSection', { section: section.title })}
                  testID={sectionTestID ? `${sectionTestID}.edit` : undefined}
                  onPress={() => {
                    onEdit(section.key);
                  }}
                >
                  {t('formReview.edit')}
                </Link>
              )}
            </View>
            <DescriptionList
              items={section.items}
              layout={layout}
              testID={sectionTestID ? `${sectionTestID}.list` : undefined}
            />
          </Card>
        );
      })}
    </View>
  );
}
