export type TooltipPlacement = 'top' | 'bottom';

/** A rectangle in window coordinates, as `measureInWindow` reports it. */
export type Rect = Readonly<{ x: number; y: number; width: number; height: number }>;

export type TooltipLayoutInput = Readonly<{
  anchor: Rect;
  windowWidth: number;
  windowHeight: number;
  placement: TooltipPlacement;
  isRtl: boolean;
  /** Widest the bubble column may be. */
  maxWidth: number;
  /** Smallest distance kept to the window edges. */
  margin: number;
  /** Space between the trigger and the bubble. */
  gap: number;
  /** Side of the arrow square. */
  arrowSize: number;
}>;

export type TooltipLayout = Readonly<{
  placement: TooltipPlacement;
  /** Width of the column that holds the bubble and its arrow. */
  width: number;
  /** Distance from the layout-start edge of the window to the column. */
  startOffset: number;
  /** Distance from the column's start edge to the arrow's start edge. */
  arrowOffset: number;
  /** Set for `bottom` placement: distance from the window top. */
  top?: number;
  /** Set for `top` placement: distance from the window bottom. */
  bottom?: number;
}>;

const MIN_SPACE_FACTOR = 5;

/**
 * Places the bubble column beside the trigger. The column is centred on the trigger and clamped
 * inside the window. Everything horizontal is measured from the layout start, so it is correct
 * in RTL, where `measureInWindow` still reports physical coordinates.
 */
export function computeTooltipLayout({
  anchor,
  windowWidth,
  windowHeight,
  placement,
  isRtl,
  maxWidth,
  margin,
  gap,
  arrowSize,
}: TooltipLayoutInput): TooltipLayout {
  const width = Math.min(maxWidth, windowWidth - margin * 2);
  const center = anchor.x + anchor.width / 2;
  const physicalLeft = Math.min(Math.max(center - width / 2, margin), windowWidth - margin - width);
  const startOffset = isRtl ? windowWidth - physicalLeft - width : physicalLeft;
  const arrowCenter = isRtl ? physicalLeft + width - center : center - physicalLeft;
  const arrowOffset = Math.min(Math.max(arrowCenter - arrowSize / 2, 0), width - arrowSize);

  // Flip when the preferred side has less than a few bubble heights of room.
  const needed = arrowSize * MIN_SPACE_FACTOR + gap;
  const spaceAbove = anchor.y;
  const spaceBelow = windowHeight - anchor.y - anchor.height;
  let side = placement;
  if (placement === 'top' && spaceAbove < needed && spaceBelow > spaceAbove) {
    side = 'bottom';
  } else if (placement === 'bottom' && spaceBelow < needed && spaceAbove > spaceBelow) {
    side = 'top';
  }

  return side === 'top'
    ? { placement: side, width, startOffset, arrowOffset, bottom: windowHeight - anchor.y + gap }
    : { placement: side, width, startOffset, arrowOffset, top: anchor.y + anchor.height + gap };
}
