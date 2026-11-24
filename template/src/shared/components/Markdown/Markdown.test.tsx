import { screen } from '@testing-library/react-native';

import { openUrlSafe } from '@services/linking/linking';
import { MAX_MARKDOWN_LENGTH } from '@shared/utils/markdown';
import { renderWithProviders } from '@test-utils/renderWithProviders';

import { Markdown } from './Markdown';

jest.mock('@services/linking/linking', () => ({
  openUrlSafe: jest.fn(() => Promise.resolve(true)),
}));

describe('Markdown', () => {
  beforeEach(() => {
    jest.mocked(openUrlSafe).mockClear();
  });

  it('renders paragraphs', async () => {
    await renderWithProviders(<Markdown>{'First line.\n\nSecond paragraph.'}</Markdown>);
    expect(screen.getByText('First line.')).toBeOnTheScreen();
    expect(screen.getByText('Second paragraph.')).toBeOnTheScreen();
  });

  it('announces headings as headers', async () => {
    await renderWithProviders(<Markdown>{'# Big\n\n## Medium\n\n### Small'}</Markdown>);
    expect(screen.getByRole('header', { name: 'Big' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Medium' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Small' })).toBeOnTheScreen();
  });

  it('renders bold, italic and code inside a sentence', async () => {
    await renderWithProviders(<Markdown>{'A **bold**, *italic* and `code` word.'}</Markdown>);
    expect(screen.getByText('A bold, italic and code word.')).toBeOnTheScreen();
    expect(screen.getByText('bold')).toBeOnTheScreen();
    expect(screen.getByText('italic')).toBeOnTheScreen();
    expect(screen.getByText('code')).toBeOnTheScreen();
  });

  it('renders bullet and numbered lists', async () => {
    await renderWithProviders(<Markdown>{'- apples\n- pears\n\n1. first\n2. second'}</Markdown>);
    expect(screen.getByText('apples')).toBeOnTheScreen();
    expect(screen.getByText('pears')).toBeOnTheScreen();
    expect(screen.getByText('1.')).toBeOnTheScreen();
    expect(screen.getByText('2.')).toBeOnTheScreen();
    expect(screen.getByText('second')).toBeOnTheScreen();
  });

  it('opens a safe link through the link service and labels it with its text', async () => {
    const { user } = await renderWithProviders(
      <Markdown>{'Read the [release notes](https://example.test/notes) now.'}</Markdown>,
    );
    const link = screen.getByRole('link', { name: 'release notes' });
    await user.press(link);
    expect(openUrlSafe).toHaveBeenCalledWith('https://example.test/notes');
  });

  it('opens a mailto link', async () => {
    const { user } = await renderWithProviders(
      <Markdown>{'[Write us](mailto:hi@x.test)'}</Markdown>,
    );
    await user.press(screen.getByRole('link', { name: 'Write us' }));
    expect(openUrlSafe).toHaveBeenCalledWith('mailto:hi@x.test');
  });

  it('shows a javascript: link as plain text with no link role', async () => {
    await renderWithProviders(<Markdown>{'[Tap me](javascript:alert(1))'}</Markdown>);
    expect(screen.getByText('Tap me')).toBeOnTheScreen();
    expect(screen.queryByRole('link')).not.toBeOnTheScreen();
  });

  it('shows HTML and images as text', async () => {
    await renderWithProviders(<Markdown>{'<b>not bold</b>'}</Markdown>);
    expect(screen.getByText('<b>not bold</b>')).toBeOnTheScreen();
  });

  it('renders nothing for empty input', async () => {
    await renderWithProviders(<Markdown testID="md">{''}</Markdown>);
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- checks that nothing renders
    expect(screen.queryByTestId('md')).not.toBeOnTheScreen();
  });

  it('renders Arabic text and lists', async () => {
    await renderWithProviders(<Markdown>{'## عنوان\n\n- **أول** عنصر\n- ثاني'}</Markdown>);
    expect(screen.getByRole('header', { name: 'عنوان' })).toBeOnTheScreen();
    expect(screen.getByText('ثاني')).toBeOnTheScreen();
  });

  it('survives malformed input and caps the length', async () => {
    const tail = 'tail-after-the-cap';
    await renderWithProviders(
      <Markdown>{`[a](**\n${'*'.repeat(50)}\n${'x'.repeat(MAX_MARKDOWN_LENGTH)}${tail}`}</Markdown>,
    );
    expect(screen.queryByText(tail, { exact: false })).not.toBeOnTheScreen();
  });

  it('passes testIDs to the blocks', async () => {
    await renderWithProviders(<Markdown testID="md">{'one\n\n# two'}</Markdown>);
    // eslint-disable-next-line rn-tempo/discouraged-syntax -- checks the testID plumbing itself
    expect(screen.getByTestId('md.block-1')).toBeOnTheScreen();
  });
});
