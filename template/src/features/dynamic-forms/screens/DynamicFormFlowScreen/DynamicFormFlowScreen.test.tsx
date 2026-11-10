import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { DynamicFormFlowScreen } from './DynamicFormFlowScreen';

const mockGoBack = jest.fn();
const mockToast = jest.fn<undefined, [string]>();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack }),
}));
jest.mock('@services/toast/toast', () => ({
  toast: {
    success: (title: string) => {
      mockToast(title);
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DynamicFormFlowScreen', () => {
  it('AC-1: opens the code demo flow on its first step', async () => {
    await renderWithProviders(
      <DynamicFormFlowScreen route={{ params: { flowId: 'demo-code' } }} />,
    );
    expect(screen.getByText('Step 1 of 5')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'About you' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Full name')).toBeOnTheScreen();
  });

  it('AC-8: opens the JSON demo flow in Arabic', async () => {
    await renderWithProviders(
      <DynamicFormFlowScreen route={{ params: { flowId: 'demo-json' } }} />,
      {
        language: 'ar',
      },
    );
    expect(screen.getByText('الخطوة 1 من 4')).toBeOnTheScreen();
    expect(screen.getByLabelText('الاسم الكامل')).toBeOnTheScreen();
  });

  it('shows an error state for an unknown flow and goes back', async () => {
    const { user } = await renderWithProviders(
      <DynamicFormFlowScreen route={{ params: { flowId: 'nope' } }} />,
    );
    expect(screen.getByText('This form does not exist.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});
