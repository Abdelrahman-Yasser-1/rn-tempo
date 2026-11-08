import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Radio } from '../Radio';

import { RadioGroup, useRadioGroup } from './RadioGroup';

function GroupProbe() {
  const group = useRadioGroup();
  return <Text>{group === null ? 'no group' : `value:${group.value ?? 'none'}`}</Text>;
}

describe('RadioGroup', () => {
  it('marks its container as a radiogroup that holds its options', async () => {
    await renderWithProviders(
      <RadioGroup value="a" onChange={jest.fn()} testID="group">
        <Radio value="a" label="Option A" />
      </RadioGroup>,
    );
    // The container is not an accessibility element (grouping it would hide its children), so
    // the role is only observable on the host view.
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- non-accessible container has no role query
    expect(screen.getByTestId('group')).toHaveProp('accessibilityRole', 'radiogroup');
    expect(screen.getByRole('radio', { name: 'Option A' })).toBeOnTheScreen();
  });

  it('forwards an accessibility label to the radiogroup', async () => {
    await renderWithProviders(
      <RadioGroup value="a" onChange={jest.fn()} accessibilityLabel="Plan" testID="group">
        <Radio value="a" label="Option A" />
      </RadioGroup>,
    );
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- non-accessible container has no role query
    expect(screen.getByTestId('group')).toHaveProp('accessibilityLabel', 'Plan');
  });

  it('provides its selection through context', async () => {
    await renderWithProviders(
      <RadioGroup value="b" onChange={jest.fn()}>
        <GroupProbe />
      </RadioGroup>,
    );
    expect(screen.getByText('value:b')).toBeOnTheScreen();
  });

  it('returns null from useRadioGroup outside a group', async () => {
    await renderWithProviders(<GroupProbe />);
    expect(screen.getByText('no group')).toBeOnTheScreen();
  });
});
