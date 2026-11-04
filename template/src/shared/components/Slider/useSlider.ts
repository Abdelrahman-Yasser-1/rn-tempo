import type { SliderProps } from './types';

type UseSliderParams = Pick<SliderProps, 'value' | 'onChange' | 'onChangeEnd' | 'min' | 'max'> &
  Readonly<{ step: number }>;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Logic of the slider: drag callbacks and the accessibility increment/decrement steps. */
// eslint-disable-next-line @eslint-react/no-unnecessary-use-prefix -- logic hook of the component (amendment 48)
export function useSlider({ value, onChange, onChangeEnd, min, max, step }: UseSliderParams) {
  const nudge = (direction: 1 | -1) => {
    const next = clamp(value + direction * step, min, max);
    if (next !== value) {
      onChange(next);
      onChangeEnd?.(next);
    }
  };

  const onIncrement = () => {
    nudge(1);
  };

  const onDecrement = () => {
    nudge(-1);
  };

  const onSlidingComplete = (next: number) => {
    onChangeEnd?.(next);
  };

  return { onValueChange: onChange, onSlidingComplete, onIncrement, onDecrement };
}
