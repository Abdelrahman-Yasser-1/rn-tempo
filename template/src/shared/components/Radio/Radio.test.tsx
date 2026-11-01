import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { RadioGroup } from '../RadioGroup';

import { Radio } from './Radio';

describe('Radio', () => {
  it('is selected inside a group when its value matches', async () => {
    await renderWithProviders(
      <RadioGroup value="b" onChange={jest.fn()}>
        <Radio value="a" label="Option A" />
        <Radio value="b" label="Option B" />
      </RadioGroup>,
    );
    expect(screen.getByRole('radio', { name: 'Option A' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Option B' })).toBeChecked();
  });

  it('reports its value to the enclosing group when pressed', async () => {
    const onChange = jest.fn();
    const { user } = await renderWithProviders(
      <RadioGroup value="a" onChange={onChange}>
        <Radio value="a" label="Option A" />
        <Radio value="b" label="Option B" />
      </RadioGroup>,
    );
    await user.press(screen.getByRole('radio', { name: 'Option B' }));
    expect(onChange).toHaveBeenLastCalledWith('b');
  });

  it('is disabled when the group is disabled', async () => {
    await renderWithProviders(
      <RadioGroup value={undefined} onChange={jest.fn()} disabled>
        <Radio value="a" label="Option A" />
      </RadioGroup>,
    );
    expect(screen.getByRole('radio', { name: 'Option A' })).toBeDisabled();
  });

  it('works standalone: unselected and presses do nothing', async () => {
    const { user } = await renderWithProviders(<Radio value="a" label="Solo" />);
    const radio = screen.getByRole('radio', { name: 'Solo' });
    expect(radio).not.toBeChecked();
    await user.press(radio);
    expect(radio).not.toBeChecked();
  });
});
