import type { ReactNode } from 'react';
import type { ViewProps } from 'react-native';

import type { ColorTokens, RadiusKey, SpacingKey } from '@theme/tokens';

export type BoxAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
export type BoxJustify = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';

/** Spacing props take token keys, never raw numbers. `ps`/`pe` and `ms`/`me` are RTL-safe start/end. */
export type BoxSpacingProps = {
  p?: SpacingKey;
  px?: SpacingKey;
  py?: SpacingKey;
  pt?: SpacingKey;
  pb?: SpacingKey;
  ps?: SpacingKey;
  pe?: SpacingKey;
  m?: SpacingKey;
  mx?: SpacingKey;
  my?: SpacingKey;
  mt?: SpacingKey;
  mb?: SpacingKey;
  ms?: SpacingKey;
  me?: SpacingKey;
  gap?: SpacingKey;
};

export type BoxLayoutProps = {
  direction?: 'row' | 'column';
  align?: BoxAlign;
  justify?: BoxJustify;
  wrap?: boolean;
  flex?: number;
};

export type BoxProps = Readonly<
  ViewProps &
    BoxSpacingProps &
    BoxLayoutProps & {
      /** Background color token key. */
      bg?: keyof ColorTokens;
      radius?: RadiusKey;
      children?: ReactNode;
    }
>;

/** Props shared by Row and Column (direction is fixed by the component). */
export type StackProps = Readonly<Omit<BoxProps, 'direction'>>;
