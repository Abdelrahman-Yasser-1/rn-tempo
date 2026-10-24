import { view } from './storybook.requires';

// Selection is not persisted: no AsyncStorage dependency (the template uses MMKV only).
const StorybookUIRoot = view.getStorybookUI({});

// eslint-disable-next-line import-x/no-default-export -- Storybook loads this file through its default export
export default StorybookUIRoot;
