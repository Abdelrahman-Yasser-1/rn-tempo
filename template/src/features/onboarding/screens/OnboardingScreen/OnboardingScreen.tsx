import { useTranslation } from 'react-i18next';
import { FlatList, useWindowDimensions, View } from 'react-native';

import { SLIDES } from '@features/onboarding/constants';
import { Button, Icon, Screen, Text } from '@shared/components';

import { styles } from './styles';
import { useOnboardingScreen } from './useOnboardingScreen';

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 60 } as const;

export function OnboardingScreen() {
  const { t } = useTranslation('app');
  const { width } = useWindowDimensions();
  const { listRef, ...vm } = useOnboardingScreen();

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
        onViewableItemsChanged={vm.onViewableChange}
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
              accessibilityState={{ selected: index === vm.activeIndex }}
              style={styles.dot(index === vm.activeIndex)}
              testID={`onboarding.dot-${String(index)}`}
            />
          ))}
        </View>
        <View style={styles.actions}>
          <Button
            variant="ghost"
            title={t('onboarding.skip')}
            onPress={vm.onSkip}
            testID="onboarding.skip-button"
          />
          <Button
            title={vm.isLast ? t('onboarding.getStarted') : t('onboarding.next')}
            onPress={vm.onNext}
            testID="onboarding.next-button"
          />
        </View>
      </View>
    </Screen>
  );
}
