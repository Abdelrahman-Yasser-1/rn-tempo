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
});
