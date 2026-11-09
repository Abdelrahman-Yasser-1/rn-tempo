import type { SelectorParam, TOptions } from 'i18next';
import type { ReactNode } from 'react';
import type { TextProps as RNTextProps } from 'react-native';

import type { ColorTokens, TypographyVariant } from '@theme/tokens';

/** `start`/`end` follow the layout direction, so they stay correct in RTL. */
export type TextAlign = 'start' | 'center' | 'end';

export type TextProps = Readonly<
  Omit<RNTextProps, 'children'> & {
    /** Typography token; display and h1-h3 are announced as headings. */
    variant?: TypographyVariant;
    /** Color token key; defaults to `textPrimary`. */
    color?: keyof ColorTokens;
    align?: TextAlign;
    /** Selector for a `common` key, e.g. `($) => $.sheet.close`, resolved with `txOptions`. Takes precedence over `children`. */
    tx?: SelectorParam;
    txOptions?: Omit<TOptions, 'ns'>;
    children?: ReactNode;
  }
>;
