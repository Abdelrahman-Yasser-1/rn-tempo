import type { Preview } from '@storybook/react-native';

const preview: Preview = {
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
