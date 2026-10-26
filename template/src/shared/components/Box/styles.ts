import { StyleSheet } from 'react-native-unistyles';

import type { BoxProps } from './types';

const ALIGN = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
} as const;

const JUSTIFY = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly',
} as const;

type BoxStyleProps = Pick<
  BoxProps,
  | 'p'
  | 'px'
  | 'py'
  | 'pt'
  | 'pb'
  | 'ps'
  | 'pe'
  | 'm'
  | 'mx'
  | 'my'
  | 'mt'
  | 'mb'
  | 'ms'
  | 'me'
  | 'gap'
  | 'bg'
  | 'radius'
  | 'direction'
  | 'align'
  | 'justify'
  | 'wrap'
  | 'flex'
>;

export const styles = StyleSheet.create((theme) => {
  const space = (key: keyof typeof theme.spacing | undefined) =>
    key === undefined ? undefined : theme.spacing[key];

  return {
    box: (props: BoxStyleProps) => ({
      flexDirection: props.direction,
      alignItems: props.align ? ALIGN[props.align] : undefined,
      justifyContent: props.justify ? JUSTIFY[props.justify] : undefined,
      flexWrap: props.wrap ? ('wrap' as const) : undefined,
      flex: props.flex,
      gap: space(props.gap),
      padding: space(props.p),
      paddingHorizontal: space(props.px),
      paddingVertical: space(props.py),
      paddingTop: space(props.pt),
      paddingBottom: space(props.pb),
      paddingStart: space(props.ps),
      paddingEnd: space(props.pe),
      margin: space(props.m),
      marginHorizontal: space(props.mx),
      marginVertical: space(props.my),
      marginTop: space(props.mt),
      marginBottom: space(props.mb),
      marginStart: space(props.ms),
      marginEnd: space(props.me),
      backgroundColor: props.bg ? theme.colors[props.bg] : undefined,
      borderRadius: props.radius ? theme.radii[props.radius] : undefined,
    }),
  };
});
