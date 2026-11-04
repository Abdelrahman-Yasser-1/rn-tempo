import { View } from 'react-native';

import { Header } from '../Header';
import { Screen } from '../Screen';
import { Text } from '../Text';

import { styles } from './styles';
import type { AuthLayoutProps } from './types';

/**
 * Shell of the sign-in family of screens: a keyboard-aware scrolling Screen with an optional
 * Header and logo, then the title and subtitle, the form content and a footer.
 */
export function AuthLayout({
  headerTitle,
  onBack,
  logo,
  title,
  subtitle,
  children,
  footer,
  testID,
}: AuthLayoutProps) {
  const headerTestID = testID?.replace(/-screen$/, '.header');

  return (
    <Screen
      preset="scroll"
      keyboardAware
      padding="xl"
      contentContainerStyle={styles.content}
      testID={testID}
    >
      {(headerTitle !== undefined || onBack !== undefined) && (
        <Header title={headerTitle} onBack={onBack} testID={headerTestID} />
      )}
      {logo !== undefined && <View style={styles.logo}>{logo}</View>}
      <View>
        <Text variant="h1" accessibilityRole="header">
          {title}
        </Text>
        {subtitle !== undefined && subtitle !== '' && <Text color="textSecondary">{subtitle}</Text>}
      </View>
      {children}
      {footer}
    </Screen>
  );
}
