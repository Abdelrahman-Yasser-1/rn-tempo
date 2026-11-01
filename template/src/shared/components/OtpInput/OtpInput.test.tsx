import { fireEvent, screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { OtpInput } from './OtpInput';

describe('OtpInput', () => {
  it('renders one labelled cell per digit, six by default', async () => {
    await renderWithProviders(<OtpInput value="" onChangeText={jest.fn()} />);
    expect(screen.getByLabelText('Digit 1 of 6')).toBeOnTheScreen();
    expect(screen.getByLabelText('Digit 6 of 6')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Digit 7 of 6')).not.toBeOnTheScreen();
  });

  it('honours a custom length', async () => {
    await renderWithProviders(<OtpInput value="" length={4} onChangeText={jest.fn()} />);
    expect(screen.getByLabelText('Digit 4 of 4')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Digit 5 of 4')).not.toBeOnTheScreen();
  });

  it('keeps only digits typed into a cell', async () => {
    const onChangeText = jest.fn();
    await renderWithProviders(<OtpInput value="" onChangeText={onChangeText} />);
    void fireEvent.changeText(screen.getByLabelText('Digit 1 of 6'), '7x');
    expect(onChangeText).toHaveBeenLastCalledWith('7');
  });

  it('spreads a pasted code across the cells and completes when full', async () => {
    const onChangeText = jest.fn();
    const onComplete = jest.fn();
    await renderWithProviders(
      <OtpInput value="" onChangeText={onChangeText} onComplete={onComplete} />,
    );
    // A multi-digit change is a paste or SMS autofill, which arrives as one text change.
    void fireEvent.changeText(screen.getByLabelText('Digit 1 of 6'), '123456');
    expect(onChangeText).toHaveBeenLastCalledWith('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('does not complete while cells remain empty', async () => {
    const onComplete = jest.fn();
    const { user } = await renderWithProviders(
      <OtpInput value="1234" onChangeText={jest.fn()} onComplete={onComplete} />,
    );
    await user.type(screen.getByLabelText('Digit 5 of 6'), '5');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('drops the previous digit on backspace from an empty cell', async () => {
    const onChangeText = jest.fn();
    await renderWithProviders(<OtpInput value="123" onChangeText={onChangeText} />);
    void fireEvent(screen.getByLabelText('Digit 4 of 6'), 'keyPress', {
      nativeEvent: { key: 'Backspace' },
    });
    expect(onChangeText).toHaveBeenLastCalledWith('12');
  });

  it('announces the error text and disables every cell', async () => {
    await renderWithProviders(
      <OtpInput value="" errorText="Enter the 6-digit code." disabled onChangeText={jest.fn()} />,
    );
    expect(screen.getByRole('alert', { name: 'Enter the 6-digit code.' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Digit 1 of 6')).toHaveProp('editable', false);
  });
});
