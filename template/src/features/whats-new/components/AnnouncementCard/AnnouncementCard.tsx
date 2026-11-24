import { View } from 'react-native';

import type { CmsEntry } from '@services/cms';
import { Button, Card, Markdown, Text } from '@shared/components';
import { isSafeUrl } from '@shared/utils';

import { styles } from './styles';

type AnnouncementCardProps = Readonly<{
  entry: CmsEntry;
  /** Called with the entry's call-to-action link. */
  onCtaPress: (url: string) => void;
  testID?: string;
}>;

/** One announcement: image, title, Markdown body and an optional call-to-action button. */
export function AnnouncementCard({ entry, onCtaPress, testID }: AnnouncementCardProps) {
  const { title, body, image, ctaLabel, ctaUrl } = entry.fields;
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);
  const hasCta =
    ctaLabel !== undefined && ctaLabel !== '' && ctaUrl !== undefined && isSafeUrl(ctaUrl);

  return (
    <View style={styles.root}>
      <Card
        variant="outlined"
        media={
          image === undefined
            ? undefined
            : { source: { uri: image.url }, accessibilityLabel: image.alt }
        }
        testID={testID}
      >
        <View style={styles.content}>
          <Text variant="title" accessibilityRole="header" testID={suffix('title')}>
            {title}
          </Text>
          {body !== undefined && body !== '' && <Markdown testID={suffix('body')}>{body}</Markdown>}
          {hasCta && (
            <View style={styles.action}>
              <Button
                title={ctaLabel}
                onPress={() => {
                  onCtaPress(ctaUrl);
                }}
                testID={suffix('cta')}
              />
            </View>
          )}
        </View>
      </Card>
    </View>
  );
}
