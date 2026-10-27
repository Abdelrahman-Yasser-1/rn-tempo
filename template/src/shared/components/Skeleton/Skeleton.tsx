import { createContext, use } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { ShimmerProvider } from 'react-native-fast-shimmer';

import { styles } from './styles';
import type { SkeletonProps } from './types';

const SkeletonContext = createContext(false);

/**
 * Loading placeholder container. It drives one shared shimmer clock for every `Bone` inside and
 * announces itself as busy; nested skeletons reuse the outermost one.
 */
export function Skeleton({ accessibilityLabel, children, testID }: SkeletonProps) {
  const { t } = useTranslation();
  const isNested = use(SkeletonContext);

  if (isNested) {
    return <>{children}</>;
  }

  return (
    <SkeletonContext value>
      <ShimmerProvider>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={accessibilityLabel ?? t('loader.label')}
          accessibilityState={{ busy: true }}
          testID={testID}
          style={styles.root}
        >
          {children}
        </View>
      </ShimmerProvider>
    </SkeletonContext>
  );
}
