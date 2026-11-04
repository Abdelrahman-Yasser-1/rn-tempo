import { renderHook } from '@testing-library/react-native';

import { useSlider } from './useSlider';

async function setup(value: number) {
  const onChange = jest.fn();
  const onChangeEnd = jest.fn();
  const view = await renderHook(() =>
    useSlider({ value, onChange, onChangeEnd, min: 0, max: 10, step: 4 }),
  );
  return { ...view, onChange, onChangeEnd };
}

describe('useSlider', () => {
  test('steps by `step` and clamps to the range', async () => {
    const { result, onChange, onChangeEnd } = await setup(8);

    result.current.onIncrement();
    expect(onChange).toHaveBeenLastCalledWith(10);
    expect(onChangeEnd).toHaveBeenLastCalledWith(10);
    result.current.onDecrement();
    expect(onChange).toHaveBeenLastCalledWith(4);
  });

  test('does nothing when a step would not change the value', async () => {
    const { result, onChange } = await setup(0);

    result.current.onDecrement();

    expect(onChange).not.toHaveBeenCalled();
  });

  test('forwards the end of a drag', async () => {
    const { result, onChangeEnd } = await setup(3);

    result.current.onSlidingComplete(7);

    expect(onChangeEnd).toHaveBeenCalledWith(7);
  });

  test('does not step past the maximum', async () => {
    const { result, onChange, onChangeEnd } = await setup(10);

    result.current.onIncrement();

    expect(onChange).not.toHaveBeenCalled();
    expect(onChangeEnd).not.toHaveBeenCalled();
  });

  test('works without an onChangeEnd handler', async () => {
    const onChange = jest.fn();
    const { result } = await renderHook(() =>
      useSlider({ value: 2, onChange, min: 0, max: 10, step: 1 }),
    );

    result.current.onIncrement();
    result.current.onSlidingComplete(5);

    expect(onChange).toHaveBeenCalledWith(3);
  });

  test('passes drag values straight to onChange', async () => {
    const { result, onChange } = await setup(3);

    result.current.onValueChange(6);

    expect(onChange).toHaveBeenCalledWith(6);
  });
});
