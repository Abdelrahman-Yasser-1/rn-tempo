import type { ReactNode } from 'react';

import type { TooltipPlacement } from '@shared/utils';

export type { TooltipPlacement };

export type TooltipProps = Readonly<{
  /** Text of the bubble. */
  content: string;
  /** The trigger. It is wrapped in a button, so pass visuals only (an `Icon` or `Text`). */
  children: ReactNode;
  /** Preferred side of the trigger; flips when there is no room. Defaults to `top`. */
  placement?: TooltipPlacement;
  /** Controlled visibility. Pair it with `onVisibleChange`; omit for press-to-toggle. */
  visible?: boolean;
  onVisibleChange?: (isVisible: boolean) => void;
  /** Name of the trigger button; needed when the trigger is only an icon. */
  accessibilityLabel?: string;
  /** Applied to the trigger; the parts add suffixes (`.bubble`, `.backdrop`). */
  testID?: string;
}>;
