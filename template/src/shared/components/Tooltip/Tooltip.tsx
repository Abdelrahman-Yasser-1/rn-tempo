import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';

import { useReducedMotion } from '@shared/hooks';

import { Text } from '../Text';

import { HIT_SLOP, styles } from './styles';
import type { TooltipProps } from './types';
import { useTooltip } from './useTooltip';

/**
 * Wraps a trigger and shows a short text bubble above or below it, with an arrow. Press the
 * trigger to toggle, or control it with `visible`. Tapping anywhere else closes it.
 */
export function Tooltip({
  content,
  children,
  placement,
  visible: isControlledVisible,
  onVisibleChange,
  accessibilityLabel,
  testID,
}: TooltipProps) {
  const { t } = useTranslation();
  const isReducedMotion = useReducedMotion();
  const { triggerRef, isVisible, isMeasured, layout, onToggle, onClose } = useTooltip({
    visible: isControlledVisible,
    onVisibleChange,
    placement,
  });
  const suffix = (part: string) => (testID ? `${testID}.${part}` : undefined);
  const isTop = layout.placement === 'top';

  return (
    <>
      <View ref={triggerRef} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ expanded: isVisible }}
          hitSlop={HIT_SLOP}
          testID={testID}
          onPress={onToggle}
        >
          {children}
        </Pressable>
      </View>
      <Modal
        transparent
        visible={isVisible}
        animationType={isReducedMotion ? 'none' : 'fade'}
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={onClose}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tooltip.close')}
          testID={suffix('backdrop')}
          style={styles.backdrop}
          onPress={onClose}
        />
        <View
          pointerEvents="none"
          style={[
            styles.column(layout.width, layout.startOffset, layout.top, layout.bottom),
            !isMeasured && styles.hidden,
          ]}
        >
          {!isTop && <View style={styles.arrow(layout.arrowOffset, false)} />}
          <View style={styles.bubble}>
            <Text
              testID={suffix('bubble')}
              variant="caption"
              color="textInverse"
              accessibilityLiveRegion="polite"
            >
              {content}
            </Text>
          </View>
          {isTop && <View style={styles.arrow(layout.arrowOffset, true)} />}
        </View>
      </Modal>
    </>
  );
}
