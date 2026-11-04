import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@test-utils/renderWithProviders';

import { FormReview } from './FormReview';

const SECTIONS = [
  {
    key: 'account',
    title: 'Account',
    items: [
      { key: 'name', label: 'Name', value: 'Ada Lovelace' },
      { key: 'email', label: 'Email', value: 'ada@example.com' },
    ],
  },
  { key: 'plan', title: 'Plan', items: [{ key: 'tier', label: 'Tier', value: 'Pro' }] },
] as const;

describe('FormReview', () => {
  it('renders every section with its rows', async () => {
    await renderWithProviders(<FormReview sections={SECTIONS} />);
    expect(screen.getByRole('header', { name: 'Account' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Plan' })).toBeOnTheScreen();
    expect(screen.getByText('Ada Lovelace')).toBeOnTheScreen();
    expect(screen.getByText('Pro')).toBeOnTheScreen();
    expect(screen.queryByRole('link')).not.toBeOnTheScreen();
  });

  it('calls onEdit with the section key', async () => {
    const onEdit = jest.fn();
    const { user } = await renderWithProviders(<FormReview sections={SECTIONS} onEdit={onEdit} />);
    await user.press(screen.getByRole('link', { name: 'Edit Plan' }));
    expect(onEdit).toHaveBeenCalledWith('plan');
  });

  it('puts the section title in the Edit link name, one link per section', async () => {
    await renderWithProviders(<FormReview sections={SECTIONS} onEdit={jest.fn()} />);
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Edit Account' })).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: 'Edit Plan' })).toBeOnTheScreen();
  });

  it('reports each section key on its own link', async () => {
    const onEdit = jest.fn();
    const { user } = await renderWithProviders(<FormReview sections={SECTIONS} onEdit={onEdit} />);
    await user.press(screen.getByRole('link', { name: 'Edit Account' }));
    await user.press(screen.getByRole('link', { name: 'Edit Plan' }));
    expect(onEdit.mock.calls).toEqual([['account'], ['plan']]);
  });

  it('reads each row with its label in both layouts', async () => {
    const { rerender } = await renderWithProviders(<FormReview sections={SECTIONS} />);
    expect(screen.getByLabelText('Tier, Pro')).toBeOnTheScreen();
    await rerender(<FormReview sections={SECTIONS} layout="vertical" />);
    expect(screen.getByLabelText('Name, Ada Lovelace')).toBeOnTheScreen();
  });

  it('passes the testID down to sections, titles and edit links', async () => {
    await renderWithProviders(
      <FormReview sections={SECTIONS} onEdit={jest.fn()} testID="review" />,
    );
    /* eslint-disable no-restricted-syntax -- checks the testID plumbing itself */
    expect(screen.getByTestId('review.plan')).toBeOnTheScreen();
    expect(screen.getByTestId('review.plan.title')).toHaveTextContent('Plan');
    expect(screen.getByTestId('review.plan.edit')).toBeOnTheScreen();
    expect(screen.getByTestId('review.plan.list.tier')).toBeOnTheScreen();
    /* eslint-enable no-restricted-syntax */
  });

  it('renders nothing without sections', async () => {
    await renderWithProviders(<FormReview sections={[]} testID="review" />);
    expect(screen.queryByRole('header')).not.toBeOnTheScreen();
  });
});
