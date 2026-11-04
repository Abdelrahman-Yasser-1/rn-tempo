import { ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Header } from '../Header';
import { Screen } from '../Screen';

import { styles } from './styles';
import type { ScreenLayoutProps } from './types';
import { useScreenLayout } from './useScreenLayout';

/**
 * Standard screen shell: an optional Header, scrolling or fixed content and a sticky footer for
 * the primary actions. `animated` fades and slides the content in.
 */
export function ScreenLayout({
  header,
  scroll: isScrollable = false,
  footer,
  animated: isAnimated = false,
  keyboardAware: isKeyboardAware = false,
  padding = 'xl',
  testID,
  children,
}: ScreenLayoutProps) {
  const { contentStyle } = useScreenLayout(isAnimated);
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);

  const content = isScrollable ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.scrollContent(padding)}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.content(padding)}>{children}</View>
  );

  return (
    <Screen preset="fixed" keyboardAware={isKeyboardAware} testID={testID}>
      {header !== undefined && <Header testID={suffix('header')} {...header} />}
      <Animated.View testID={suffix('content')} style={[styles.flex, contentStyle]}>
        {content}
      </Animated.View>
      {footer !== undefined && (
        <View testID={suffix('footer')} style={styles.footer}>
          {footer}
        </View>
      )}
    </Screen>
  );
}
