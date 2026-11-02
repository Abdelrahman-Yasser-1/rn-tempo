import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, useWindowDimensions, View } from 'react-native';
import type { FlatListProps } from 'react-native';

import { Button, Icon, Screen, Text } from '@shared/components';

import { SLIDES, type Slide } from '../../constants';
import { useOnboardingStore } from '../../store/onboarding.store';

import { styles } from './styles';

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 60 } as const;
type ViewableChangeHandler = NonNullable<FlatListProps<Slide>['onViewableItemsChanged']>;

const LAST_INDEX = SLIDES.length - 1;

export function OnboardingScreen() {
  const { t } = useTranslation('app');
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Slide>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const complete = useOnboardingStore((state) => state.complete);
  const isLast = activeIndex === LAST_INDEX;

  // Viewability is layout-agnostic, so paging stays correct in RTL where scroll offsets mirror.
  const handleViewableChange = useCallback<ViewableChangeHandler>(({ viewableItems }) => {
    const index = viewableItems[0]?.index;
    if (typeof index === 'number') {
      setActiveIndex(index);
    }
  }, []);

  const handleNext = () => {
    if (isLast) {
      complete();
      return;
    }
    listRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
  };

  return (
    <Screen testID="onboarding-screen">
      <FlatList
        ref={listRef}
        style={styles.list}
        data={SLIDES}
        keyExtractor={(slide) => slide.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        viewabilityConfig={VIEWABILITY_CONFIG}
        onViewableItemsChanged={handleViewableChange}
        renderItem={({ item, index }) => (
          <View style={styles.slide(width)} testID={`onboarding.slide-${String(index)}`}>
            <View style={styles.iconCircle}>
              <Icon name={item.icon} size={72} color="primary" />
            </View>
            <Text variant="h1" align="center" accessibilityRole="header">
              {t(item.titleKey)}
            </Text>
            <Text color="textSecondary" align="center">
              {t(item.bodyKey)}
            </Text>
          </View>
        )}
      />
      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((slide, index) => (
            <View
              key={slide.id}
              accessible
              accessibilityLabel={t('onboarding.pageLabel', {
                current: index + 1,
                total: SLIDES.length,
              })}
              accessibilityState={{ selected: index === activeIndex }}
              style={styles.dot(index === activeIndex)}
              testID={`onboarding.dot-${String(index)}`}
            />
          ))}
        </View>
        <View style={styles.actions}>
          <Button
            variant="ghost"
            title={t('onboarding.skip')}
            onPress={complete}
            testID="onboarding.skip-button"
          />
          <Button
            title={isLast ? t('onboarding.getStarted') : t('onboarding.next')}
            onPress={handleNext}
            testID="onboarding.next-button"
          />
        </View>
      </View>
    </Screen>
  );
}
