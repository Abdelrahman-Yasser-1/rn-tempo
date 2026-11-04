import type { ReactNode } from 'react';
import type { PressableProps } from 'react-native';

import type { ImageProps } from '../Image';

export type CardVariant = 'elevated' | 'outlined' | 'filled';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg' | 'xl';

/** An image across the top edge of the card, with an optional layer drawn over it. */
export type CardMedia = Readonly<{
  source: ImageProps['source'];
  /** Informative images need a label; omit it for decorative ones. */
  accessibilityLabel?: string;
  /** Height in points; defaults to 160. The image fills the card's width. */
  height?: number;
  resizeMode?: NonNullable<ImageProps['resizeMode']>;
  /** Drawn over the image, e.g. a badge or a title on a scrim. */
  overlay?: ReactNode;
}>;

export type CardProps = Readonly<
  Omit<PressableProps, 'children' | 'style'> & {
    variant?: CardVariant;
    /** Padding around the children (not the media); defaults to `lg`. Use `none` with `CardSection`s. */
    padding?: CardPadding;
    media?: CardMedia;
    /** Pass `onPress` to make the whole card a button. */
    children?: ReactNode;
  }
>;
