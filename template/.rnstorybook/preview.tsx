import type { Decorator, Preview } from '@storybook/react-native';
import { useState, type ReactNode } from 'react';
import { StyleSheet, UnistylesRuntime } from 'react-native-unistyles';

import { AppProviders } from '@app/providers/AppProviders';
import { i18n } from '@services/i18n/i18n';
import type { Language } from '@services/i18n/languageManager';
import { isRtlLanguage } from '@services/i18n/languageManager';
import { Box, Chip, Row } from '@shared/components';

type ThemeName = 'light' | 'dark';

/**
 * On-device toolbar for every story. Language switches translations and mirrors the story with
 * `direction` instead of the app's restart-based RTL flip, so both directions can be compared live.
 */
function StoryFrame({ children }: Readonly<{ children: ReactNode }>) {
  const [theme, setTheme] = useState<ThemeName>(UnistylesRuntime.themeName ?? 'light');
  const [language, setLanguage] = useState<Language>(i18n.language === 'ar' ? 'ar' : 'en');

  const selectTheme = (next: ThemeName) => {
    UnistylesRuntime.setAdaptiveThemes(false);
    UnistylesRuntime.setTheme(next);
    setTheme(next);
  };
  const selectLanguage = (next: Language) => {
    void i18n.changeLanguage(next);
    setLanguage(next);
  };

  return (
    <Box bg="background" style={isRtlLanguage(language) ? styles.rtl : styles.ltr}>
      <Row gap="xs" p="sm" style={styles.toolbar}>
        {(['light', 'dark'] as const).map((name) => (
          <Chip
            key={name}
            label={name}
            selected={theme === name}
            onPress={() => {
              selectTheme(name);
            }}
          />
        ))}
        {(['en', 'ar'] as const).map((name) => (
          <Chip
            key={name}
            label={name}
            selected={language === name}
            onPress={() => {
              selectLanguage(name);
            }}
          />
        ))}
      </Row>
      <Box p="md" style={styles.content}>
        {children}
      </Box>
    </Box>
  );
}

const withAppProviders: Decorator = (renderStory) => (
  <AppProviders>
    <StoryFrame>{renderStory()}</StoryFrame>
  </AppProviders>
);

const styles = StyleSheet.create({
  ltr: { flex: 1, direction: 'ltr' },
  rtl: { flex: 1, direction: 'rtl' },
  // Toolbar order stays fixed so the switches do not jump when the story mirrors.
  toolbar: { direction: 'ltr' },
  content: { flex: 1 },
});

const preview: Preview = {
  decorators: [withAppProviders],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
  },
};

// eslint-disable-next-line import-x/no-default-export -- Storybook loads this file through its default export
export default preview;
