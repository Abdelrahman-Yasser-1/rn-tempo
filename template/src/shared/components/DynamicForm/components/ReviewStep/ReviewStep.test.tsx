import { screen } from '@testing-library/react-native';

import type { StepConfig } from '@shared/components/DynamicForm/components/FieldRegistry';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { ReviewStep } from './ReviewStep';

type Values = { name: string; subscribe: boolean; code: string; hidden: string };

const label = (en: string) => ({ en, ar: en });

const steps: StepConfig<Values>[] = [
  {
    id: 'about',
    title: label('About you'),
    fields: [
      { type: 'text', name: 'name', label: label('Name') },
      { type: 'switch', name: 'subscribe', label: label('Subscribe') },
      { type: 'text', name: 'code', label: label('Code'), sensitive: true },
    ],
  },
  { id: 'later', title: label('Later'), fields: [], visibleIf: () => false },
];

const values: Values = { name: 'Sam', subscribe: true, code: 'secret-123', hidden: '' };

describe('ReviewStep', () => {
  it('shows one section per visible step with the answers, and no sensitive value', async () => {
    await renderWithProviders(<ReviewStep steps={steps} values={values} onEdit={jest.fn()} />);

    expect(screen.getByRole('header', { name: 'About you' })).toBeOnTheScreen();
    expect(screen.getByText('Sam')).toBeOnTheScreen();
    expect(screen.getByText('Yes')).toBeOnTheScreen();
    expect(screen.queryByText('secret-123')).not.toBeOnTheScreen();
    expect(screen.queryByText('Code')).not.toBeOnTheScreen();
    expect(screen.queryByText('Later')).not.toBeOnTheScreen();
  });

  it('calls onEdit with the index of the step whose Edit link was pressed', async () => {
    const onEdit = jest.fn<undefined, [number]>();
    const { user } = await renderWithProviders(
      <ReviewStep steps={steps} values={values} onEdit={onEdit} />,
    );

    await user.press(screen.getByRole('link', { name: /Edit/ }));

    expect(onEdit).toHaveBeenCalledWith(0);
  });

  it('says there is nothing to review when no step has an answer to show', async () => {
    await renderWithProviders(
      <ReviewStep steps={[{ fields: [] }]} values={values} onEdit={jest.fn()} />,
    );

    expect(screen.getByText('There is nothing to review.')).toBeOnTheScreen();
  });
});
