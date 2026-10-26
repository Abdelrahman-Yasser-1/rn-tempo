import { View } from 'react-native';

import { styles } from './styles';
import type { BoxProps } from './types';

/** Layout container whose spacing, background and radius props map to theme tokens. */
export function Box({
  p,
  px,
  py,
  pt,
  pb,
  ps,
  pe,
  m,
  mx,
  my,
  mt,
  mb,
  ms,
  me,
  gap,
  bg,
  radius,
  direction,
  align,
  justify,
  wrap: shouldWrap,
  flex,
  style,
  ...rest
}: BoxProps) {
  const boxStyle = styles.box({
    p,
    px,
    py,
    pt,
    pb,
    ps,
    pe,
    m,
    mx,
    my,
    mt,
    mb,
    ms,
    me,
    gap,
    bg,
    radius,
    direction,
    align,
    justify,
    wrap: shouldWrap,
    flex,
  });

  return <View {...rest} style={[boxStyle, style]} />;
}
