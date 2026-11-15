import { renderHookWithProviders } from '@test-utils/renderWithProviders';

import { useDynamicFormFlowScreen } from './useDynamicFormFlowScreen';

const mockGoBack = jest.fn();
const mockSuccess = jest.fn<undefined, [string]>();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack }),
}));
jest.mock('@services/toast/toast', () => ({
  toast: {
    success: (title: string) => {
      mockSuccess(title);
    },
  },
}));

describe('useDynamicFormFlowScreen', () => {
  it('AC-9: submit shows a toast with no values and goes back', async () => {
    const { result } = await renderHookWithProviders(() =>
      useDynamicFormFlowScreen({ params: { flowId: 'demo-code' } }),
    );
    expect(result.current.flow?.id).toBe('demo-code');
    result.current.onSubmit();
    expect(mockSuccess).toHaveBeenCalledWith('Form submitted');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('finds no flow for an unknown id', async () => {
    const { result } = await renderHookWithProviders(() =>
      useDynamicFormFlowScreen({ params: { flowId: 'nope' } }),
    );
    expect(result.current.flow).toBeUndefined();
  });
});
