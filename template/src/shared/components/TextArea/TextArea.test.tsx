import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { TextArea } from './TextArea';

describe('TextArea', () => {
  it('shows the length against the limit', async () => {
    await renderWithProviders(<TextArea label="Notes" maxLength={10} value="abc" />);
    expect(screen.getByText('3/10')).toBeOnTheScreen();
  });

  it('defaults to a 250 character limit', async () => {
    await renderWithProviders(<TextArea label="Notes" />);
    expect(screen.getByText('0/250')).toBeOnTheScreen();
    expect(screen.getByLabelText('Notes')).toHaveProp('maxLength', 250);
  });

  it('updates the counter as the user types and reports the text', async () => {
    const onChangeText = jest.fn();
    const { user } = await renderWithProviders(
      <TextArea label="Notes" maxLength={10} onChangeText={onChangeText} />,
    );
    await user.type(screen.getByLabelText('Notes'), 'hello');
    expect(screen.getByText('5/10')).toBeOnTheScreen();
    expect(onChangeText).toHaveBeenLastCalledWith('hello');
  });

  it('starts the counter from the default value', async () => {
    await renderWithProviders(<TextArea label="Notes" maxLength={10} defaultValue="abcd" />);
    expect(screen.getByText('4/10')).toBeOnTheScreen();
  });

  it('does not accept more characters than maxLength', async () => {
    const { user } = await renderWithProviders(<TextArea label="Notes" maxLength={4} />);
    await user.type(screen.getByLabelText('Notes'), 'abcdefgh');
    expect(screen.getByText('4/4')).toBeOnTheScreen();
  });

  it('describes the count for screen readers', async () => {
    await renderWithProviders(<TextArea label="Notes" maxLength={10} value="abc" />);
    expect(screen.getByLabelText('3 of 10 characters')).toBeOnTheScreen();
  });
});
