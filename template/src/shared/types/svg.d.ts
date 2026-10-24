// Typing for SVGs imported through react-native-svg-transformer (see metro.config.js).
declare module '*.svg' {
  import type { FC } from 'react';
  import type { SvgProps } from 'react-native-svg';

  const content: FC<SvgProps>;
  // eslint-disable-next-line import-x/no-default-export -- SVG modules are default exports by definition
  export default content;
}
