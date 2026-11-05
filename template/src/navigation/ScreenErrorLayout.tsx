import type { ReactElement } from 'react';

import { ErrorBoundary } from '@shared/components';

type ScreenErrorLayoutProps = Readonly<{
  route: Readonly<{ key: string; name: string }>;
  navigation: Readonly<{ canGoBack: () => boolean; goBack: () => void }>;
  children: ReactElement;
}>;

/**
 * Navigator `screenLayout` that isolates every screen: a render error shows a "Try again" fallback
 * inside that screen while the tab bar and the other screens keep working. The log line carries
 * the route name, which names the feature that failed.
 */
export function ScreenErrorLayout({ route, navigation, children }: ScreenErrorLayoutProps) {
  return (
    <ErrorBoundary
      variant="screen"
      screenName={route.name}
      resetKeys={[route.key]}
      onGoBack={
        navigation.canGoBack()
          ? () => {
              navigation.goBack();
            }
          : undefined
      }
      testID={`${route.name}.error`}
    >
      {children}
    </ErrorBoundary>
  );
}
