import { KeyboardAvoidingView, Platform, ScrollView, StatusBar, View } from 'react-native';
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

  const body =
    preset === 'scroll' ? (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scrollContent(padding), contentContainerStyle]}
      >
        {children}
      </ScrollView>
    ) : (
      <View style={[styles.flex, styles.content(padding), contentContainerStyle]}>{children}</View>
    );

  return (
    <SafeAreaView testID={testID} edges={safeAreaEdges} style={styles.root}>
      <StatusBar barStyle={barStyleFor(statusBarStyle, theme.name)} />
      {isKeyboardAware ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}
