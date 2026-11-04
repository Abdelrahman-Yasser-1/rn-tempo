import { useEffect, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import type { HostInstance } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

import { useRtl } from '@shared/hooks';
import { computeTooltipLayout } from '@shared/utils';
import type { Rect, TooltipLayout } from '@shared/utils';

import type { TooltipProps } from './types';

type UseTooltipParams = Pick<TooltipProps, 'visible' | 'onVisibleChange' | 'placement'>;

const MAX_WIDTH = 280;

/**
 * Open state (controlled or press-to-toggle) and the measured placement of the bubble. The
 * trigger ref is returned on its own because refs must not travel inside a view-model object.
 */
export function useTooltip({
  visible: isControlledVisible,
  onVisibleChange,
  placement = 'top',
}: UseTooltipParams) {
  const { theme } = useUnistyles();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isRtl = useRtl();
  const triggerRef = useRef<HostInstance>(null);
  const [isInternalVisible, setIsInternalVisible] = useState(false);
  const [anchor, setAnchor] = useState<Rect | undefined>();
  const isVisible = isControlledVisible ?? isInternalVisible;

  useEffect(() => {
    if (isVisible) {
      triggerRef.current?.measureInWindow((x, y, width, height) => {
        setAnchor({ x, y, width, height });
      });
    }
  }, [isVisible]);

  const setVisible = (isNextVisible: boolean) => {
    if (isControlledVisible === undefined) {
      setIsInternalVisible(isNextVisible);
    }
    if (!isNextVisible) {
      setAnchor(undefined);
    }
    onVisibleChange?.(isNextVisible);
  };

  const onToggle = () => {
    setVisible(!isVisible);
  };
  const onClose = () => {
    setVisible(false);
  };

  const isMeasured = anchor !== undefined;
  const layout: TooltipLayout =
    anchor === undefined
      ? { placement, width: MAX_WIDTH, startOffset: 0, arrowOffset: 0, top: 0 }
      : computeTooltipLayout({
          anchor,
          windowWidth,
          windowHeight,
          placement,
          isRtl,
          maxWidth: MAX_WIDTH,
          margin: theme.spacing.lg,
          gap: theme.spacing.sm,
          arrowSize: theme.spacing.md,
        });

  return { triggerRef, isVisible, isMeasured, layout, onToggle, onClose };
}
