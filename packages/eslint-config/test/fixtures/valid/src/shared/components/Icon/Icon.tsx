import Svg, { Path } from 'react-native-svg';

import type { IconProps } from './types';

/** Draws a square glyph; the only place that uses react-native-svg. */
export function Icon({ size }: Readonly<IconProps>) {
  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX}>
      <Path d={GLYPH} />
    </Svg>
  );
}

const VIEW_BOX = '0 0 24 24';
const GLYPH = 'M0 0h24v24H0z';
