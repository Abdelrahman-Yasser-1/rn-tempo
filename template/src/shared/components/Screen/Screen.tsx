import { ScrollView, StatusBar, View } from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUnistyles } from 'react-native-unistyles';

import { styles } from './styles';
import type { ScreenProps, ScreenStatusBarStyle } from './types';

const DEFAULT_EDGES = ['top', 'bottom'] as const;

const barStyleFor = (
  statusBarStyle: ScreenStatusBarStyle,
  themeName: 'light' | 'dark',
): 'light-content' | 'dark-content' => {
  const autoStyle = themeName === 'dark' ? 'light' : 'dark';
  const resolved = statusBarStyle === 'auto' ? autoStyle : statusBarStyle;
  return resolved === 'light' ? 'light-content' : 'dark-content';
};

/** Screen container: safe-area insets, fixed or scrolling content, keyboard avoidance, status bar. */
export function Screen({
  preset = 'fixed',
  safeAreaEdges = DEFAULT_EDGES,
  keyboardAware: isKeyboardAware = false,
  statusBarStyle = 'auto',
  padding = 'none',
  contentContainerStyle,
  testID,
  children,
}: ScreenProps) {
  const { theme } = useUnistyles();

  const scrollContent = [styles.scrollContent(padding), contentContainerStyle];
  // A scrolling keyboard-aware screen scrolls the focused field into view itself; the library
  // view below it would only shrink the scroll area a second time.
  const isKeyboardScroll = isKeyboardAware && preset === 'scroll';

  const renderScroll = () =>
    isKeyboardScroll ? (
      <KeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        bottomOffset={theme.spacing.xl}
        contentContainerStyle={scrollContent}
      >
        {children}
      </KeyboardAwareScrollView>
    ) : (
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={scrollContent}>
        {children}
      </ScrollView>
    );

  const body =
    preset === 'scroll' ? (
      renderScroll()
    ) : (
      <View style={[styles.flex, styles.content(padding), contentContainerStyle]}>{children}</View>
    );

  return (
    <SafeAreaView testID={testID} edges={safeAreaEdges} style={styles.root}>
      <StatusBar barStyle={barStyleFor(statusBarStyle, theme.name)} />
      {isKeyboardAware && !isKeyboardScroll ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior="padding"
          keyboardVerticalOffset={theme.spacing.none}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}
